/**
 * Integration tests against the DEV Supabase project (never production).
 *
 * Creates throwaway users via the admin API, exercises RLS / the mood-limit trigger /
 * the SQL period-math service / reflection idempotency with real network calls, then
 * DELETES the users (cascades their rows) in `after` — even if a test fails.
 *
 * Run:  npm run test:integration
 * Needs (.env): EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
 *               SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF.
 * The service-role (secret) key is fetched at runtime via the Management API so it
 * never lives in a file.
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---- config ----------------------------------------------------------------
function parseEnv(path) {
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}
const env = parseEnv('.env');
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = env.SUPABASE_PROJECT_REF;

const authOff = { auth: { persistSession: false, autoRefreshToken: false } };
let admin; // service-role client
const U = {}; // tag -> { id, email, client }

async function fetchServiceKey() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const keys = await res.json();
  const secret = keys.find((k) => k.type === 'secret') || keys.find((k) => k.name === 'service_role');
  if (!secret?.api_key) throw new Error('could not resolve service key');
  return secret.api_key;
}

async function makeUser(tag) {
  const email = `qa-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@inner-circle-qa.test`;
  const password = `Qa!${Math.random().toString(36).slice(2)}A9`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = created.user.id;
  const anon = createClient(URL, ANON, authOff);
  const { data: signin, error: se } = await anon.auth.signInWithPassword({ email, password });
  if (se) throw se;
  const client = createClient(URL, ANON, {
    ...authOff,
    global: { headers: { Authorization: `Bearer ${signin.session.access_token}` } },
  });
  return { id, email, client };
}

before(async () => {
  for (const k of ['url', 'anon', 'token', 'ref']) {
    if (!{ url: URL, anon: ANON, token: TOKEN, ref: REF }[k]) {
      throw new Error(`missing .env value for ${k}`);
    }
  }
  const service = await fetchServiceKey();
  admin = createClient(URL, service, authOff);
  for (const tag of ['a', 'b', 'c', 'd']) U[tag] = await makeUser(tag);
});

after(async () => {
  for (const tag of Object.keys(U)) {
    if (U[tag]?.id) await admin.auth.admin.deleteUser(U[tag].id).catch(() => {});
  }
});

// ---- RLS cross-user isolation ---------------------------------------------
describe('RLS: a user can only touch their own rows', () => {
  let aEntryId;

  test('A creates a private entry', async () => {
    const { data, error } = await U.a.client
      .from('journal_entries')
      .insert({ user_id: U.a.id, mood_slug: 'happy', note: 'A private note' })
      .select()
      .single();
    assert.equal(error, null);
    aEntryId = data.id;
  });

  test('B cannot read A’s entries (by user_id or id)', async () => {
    const byUser = await U.b.client.from('journal_entries').select('*').eq('user_id', U.a.id);
    assert.deepEqual(byUser.data, []);
    const byId = await U.b.client.from('journal_entries').select('*').eq('id', aEntryId);
    assert.deepEqual(byId.data, []);
  });

  test('B cannot update A’s entry (RLS filters it → 0 rows, content unchanged)', async () => {
    const upd = await U.b.client
      .from('journal_entries')
      .update({ note: 'hacked' })
      .eq('id', aEntryId)
      .select();
    assert.deepEqual(upd.data ?? [], []);
    const { data } = await admin.from('journal_entries').select('note').eq('id', aEntryId).single();
    assert.equal(data.note, 'A private note');
  });

  test('B cannot delete A’s entry', async () => {
    await U.b.client.from('journal_entries').delete().eq('id', aEntryId);
    const { data } = await admin.from('journal_entries').select('id').eq('id', aEntryId).maybeSingle();
    assert.ok(data, 'entry must still exist');
  });

  test('A cannot insert an entry spoofing B’s user_id (with-check)', async () => {
    const { error } = await U.a.client
      .from('journal_entries')
      .insert({ user_id: U.b.id, mood_slug: 'happy' })
      .select();
    assert.ok(error, 'insert under another user_id must be rejected');
  });

  test('B cannot read A’s profile', async () => {
    const { data } = await U.b.client.from('profiles').select('*').eq('user_id', U.a.id);
    assert.deepEqual(data, []);
  });
});

// ---- per-entry moods (overhaul spec §1.2 / §1.3) --------------------------
// The mood limit is PER ENTRY (up to 3), never per user or per day. Replacing a mood
// never consumes an extra slot. This LOCKS that rule against regressions.
describe('Per-entry moods: up to 3 per entry, NO per-user or per-day limit', () => {
  test('an entry accepts up to 3 distinct moods; mood_slug mirrors the first', async () => {
    const { data, error } = await U.c.client
      .from('journal_entries')
      .insert({ user_id: U.c.id, mood_slugs: ['happy', 'sad', 'calm'] })
      .select('mood_slug, mood_slugs')
      .single();
    assert.equal(error, null);
    assert.deepEqual([...data.mood_slugs].sort(), ['calm', 'happy', 'sad']);
    assert.equal(data.mood_slug, 'happy');
  });

  test('NO per-day limit: many same-day entries with many distinct moods all succeed', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Distinct moods well beyond 3 across the day — the OLD per-user cap would reject these.
    const batches = [
      ['grateful', 'tired', 'neutral'],
      ['anxious', 'frustrated', 'angry'],
      ['content', 'happy', 'sad'],
    ];
    for (const moods of batches) {
      const { error } = await U.c.client
        .from('journal_entries')
        .insert({ user_id: U.c.id, mood_slugs: moods, local_date: today })
        .select();
      assert.equal(error, null, `same-day entry [${moods}] must be accepted`);
    }
    const { data } = await admin
      .from('journal_entries')
      .select('id')
      .eq('user_id', U.c.id)
      .eq('local_date', today);
    assert.ok(data.length >= 4, 'multiple entries per day must be allowed (no daily limit)');
  });

  test('replacing a mood on an entry does not consume a slot (§1.3)', async () => {
    const { data: created, error: ce } = await U.c.client
      .from('journal_entries')
      .insert({ user_id: U.c.id, mood_slugs: ['grateful'] })
      .select('id')
      .single();
    assert.equal(ce, null);
    const { data: updated, error } = await U.c.client
      .from('journal_entries')
      .update({ mood_slugs: ['tired'] })
      .eq('id', created.id)
      .select('mood_slugs, mood_slug')
      .single();
    assert.equal(error, null);
    assert.deepEqual(updated.mood_slugs, ['tired']); // grateful → tired, still ONE mood
    assert.equal(updated.mood_slug, 'tired');
  });

  test('a 4th mood in ONE entry is capped to 3; duplicates collapse (server dedupe)', async () => {
    const { data: capped, error: e1 } = await U.c.client
      .from('journal_entries')
      .insert({ user_id: U.c.id, mood_slugs: ['happy', 'sad', 'calm', 'angry'] })
      .select('mood_slugs')
      .single();
    assert.equal(e1, null);
    assert.equal(capped.mood_slugs.length, 3, 'per-entry cap is 3');

    const { data: deduped, error: e2 } = await U.c.client
      .from('journal_entries')
      .insert({ user_id: U.c.id, mood_slugs: ['happy', 'happy', 'sad'] })
      .select('mood_slugs')
      .single();
    assert.equal(e2, null);
    assert.deepEqual(deduped.mood_slugs, ['happy', 'sad']);
  });
});

// ---- period service (pure SQL date math) ----------------------------------
describe('Reflection period service: next-unlock math (timezone-local, Monday weeks)', () => {
  const unlock = async (p_type, p_today) => {
    const { data, error } = await admin.rpc('reflection_next_unlock', { p_type, p_today });
    assert.equal(error, null);
    return data;
  };

  test('weekly → next Monday (entry on a Monday)', async () => {
    assert.equal(await unlock('weekly', '2026-06-22'), '2026-06-29'); // 06-22 is Monday
  });
  test('weekly → same week’s next Monday (mid-week)', async () => {
    assert.equal(await unlock('weekly', '2026-06-25'), '2026-06-29');
  });
  test('weekly across a year boundary', async () => {
    assert.equal(await unlock('weekly', '2026-12-28'), '2027-01-04'); // 12-28 is Monday
  });
  test('monthly → 1st of next month', async () => {
    assert.equal(await unlock('monthly', '2026-06-15'), '2026-07-01');
  });
  test('monthly across leap February', async () => {
    assert.equal(await unlock('monthly', '2024-02-29'), '2024-03-01');
  });

  // Yearly unlock is ANNIVERSARY-based — a full year after the user's FIRST entry, via
  // reflection_yearly_unlock (what get_reflections_overview uses for the yearly card) —
  // NEVER the calendar new year (§1.4). This locks that rule against regressions.
  const yearlyUnlock = async (p_first, p_today) => {
    const { data, error } = await admin.rpc('reflection_yearly_unlock', { p_first, p_today });
    assert.equal(error, null);
    return data;
  };
  test('yearly → one full year after the first entry, never Jan 1 (§1.4)', async () => {
    assert.equal(await yearlyUnlock('2026-07-01', '2026-07-02'), '2027-07-01'); // spec example
    assert.equal(await yearlyUnlock('2026-11-15', '2026-12-01'), '2027-11-15'); // spec example
    assert.equal(await yearlyUnlock('2026-06-22', '2026-07-03'), '2027-06-22');
    assert.equal(await yearlyUnlock('2026-06-22', '2027-06-22'), '2028-06-22'); // on the anniversary → next year
    assert.notEqual(await yearlyUnlock('2026-07-01', '2026-07-02'), '2027-01-01');
  });
});

describe('Reflection period service: due periods + day number (seeded data)', () => {
  const entryIds = {};

  before(async () => {
    // D journals on 2026-06-01 (x2, same day) and 2026-06-03 — single mood (no cap issue).
    const rows = [
      { user_id: U.d.id, mood_slug: 'happy', local_date: '2026-06-01' },
      { user_id: U.d.id, mood_slug: 'happy', local_date: '2026-06-01' },
      { user_id: U.d.id, mood_slug: 'happy', local_date: '2026-06-03' },
    ];
    const { data, error } = await admin.from('journal_entries').insert(rows).select('id, local_date');
    assert.equal(error, null);
    entryIds.first = data.find((r) => r.local_date === '2026-06-01').id;
    entryIds.third = data.find((r) => r.local_date === '2026-06-03').id;
  });

  test('day number counts DISTINCT journaling days', async () => {
    const first = await U.d.client.rpc('get_entry_day_number', { p_entry_id: entryIds.first });
    assert.equal(first.data, 1); // 06-01 → day 1 (same-day 2nd entry is still day 1)
    const third = await U.d.client.rpc('get_entry_day_number', { p_entry_id: entryIds.third });
    assert.equal(third.data, 2); // 06-03 → day 2
  });

  test('a completed week with entries is due; the in-progress week is not', async () => {
    const after = await admin.rpc('get_due_reflection_periods', { p_today: '2026-06-15', p_user: U.d.id });
    const weekly = (after.data ?? []).filter((r) => r.type === 'weekly' && r.period_start === '2026-06-01');
    assert.equal(weekly.length, 1, 'completed week 06-01..06-07 should be due');
    assert.equal(Number(weekly[0].entry_count), 3);

    const during = await admin.rpc('get_due_reflection_periods', { p_today: '2026-06-05', p_user: U.d.id });
    const stillRunning = (during.data ?? []).filter((r) => r.type === 'weekly' && r.period_start === '2026-06-01');
    assert.equal(stillRunning.length, 0, 'an in-progress week must not be due yet');
  });

  test('an authenticated user cannot look up ANOTHER user’s due periods (forbidden)', async () => {
    const { error } = await U.a.client.rpc('get_due_reflection_periods', {
      p_today: '2026-06-15',
      p_user: U.d.id,
    });
    assert.ok(error, 'cross-user period lookup must be forbidden');
  });
});

// ---- reflection idempotency + static behavior + RLS -----------------------
describe('Reflections: unique per period, static, owner-only', () => {
  const period = { type: 'weekly', period_start: '2026-06-01', period_end: '2026-06-07' };

  test('one reflection per (user, type, period); a duplicate is rejected', async () => {
    const row = { user_id: U.d.id, ...period, status: 'ready', content: 'Steady week.' };
    const first = await admin.from('reflections').insert(row);
    assert.equal(first.error, null);
    const dup = await admin.from('reflections').insert(row);
    assert.ok(dup.error, 'duplicate (user, type, period_start) must violate the unique constraint');
  });

  test('a READY period is no longer "due" (won’t regenerate — static)', async () => {
    const { data } = await admin.rpc('get_due_reflection_periods', { p_today: '2026-06-15', p_user: U.d.id });
    const weekly = (data ?? []).filter((r) => r.type === 'weekly' && r.period_start === '2026-06-01');
    assert.equal(weekly.length, 0, 'a ready weekly reflection must not be due again');
  });

  test('B cannot read D’s reflections', async () => {
    const { data } = await U.b.client.from('reflections').select('*').eq('user_id', U.d.id);
    assert.deepEqual(data, []);
  });
});

// ---- joining through an email invite (no per-person visibility since 2026-09-29) ----
describe('Joining through an email invite marks it accepted and hides nothing', () => {
  let circle;

  test('owner A creates a circle', async () => {
    const { data, error } = await U.a.client
      .from('circles')
      .insert({ owner_id: U.a.id, name: 'QA Circle', type: 'private' })
      .select('id, invite_code')
      .single();
    assert.equal(error, null);
    circle = data;
  });

  test('owner A emails an invite to C', async () => {
    const { error } = await admin.from('circle_email_invites').insert({
      circle_id: circle.id,
      email: U.c.email,
      invited_by: U.a.id,
      status: 'pending',
    });
    assert.equal(error, null);
  });

  test('when C joins, the invite is marked accepted and no visibility rule is written', async () => {
    const join = await U.c.client.rpc('redeem_invite_code', { code: circle.invite_code });
    assert.equal(join.error, null);

    const { data: perm } = await admin
      .from('sharing_permissions')
      .select('owner_id')
      .eq('owner_id', U.a.id)
      .eq('target_user_id', U.c.id)
      .maybeSingle();
    assert.equal(perm, null, 'joining must not create a per-person visibility row');

    const { data: inv } = await admin
      .from('circle_email_invites')
      .select('status')
      .eq('circle_id', circle.id)
      .eq('email', U.c.email)
      .maybeSingle();
    assert.equal(inv.status, 'accepted');
  });
});
