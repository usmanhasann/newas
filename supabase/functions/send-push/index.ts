// send-push — fans out notifications for an event, server-side (build prompt §5.3: the client
// invokes this ONCE; recipients are resolved here, never looped on the client). Delivery uses Expo's
// push service (no FCM/APNs keys on the server). Deno Edge runtime.
//
// Rules (client notifications spec, 2026-09-29):
// - Every event is checked against the database (the actor really did it), so a crafted call can't
//   push anyone.
// - Circle pushes honor the recipient's OWN switches for THAT circle (circle_notification_prefs; no
//   row = ON). Public: replies, reactions, new prompts. Private: replies, reactions, join requests
//   (owner), new shared entries, new posts.
// - Reactions notify on each person's FIRST reaction only (claim_reaction_push) — changing, removing
//   or re-adding one never notifies again.
// - "Join request approved" is mandatory: no switch.
// - A shared entry is a post in the circle (circle_posts.entry_id). It is announced by share_created
//   (the "New Shared Entries" switch), never as a new post. Each person is told once and the push
//   names the circle (and its post), so tapping it can open that circle (client 10/14 p.8).
// - One push per event, whatever the app sends (claim_* ledgers): a post or reply once, an approval
//   once, a join request at most once a day per person, a shared entry once per circle. A Private
//   circle's pushes only go to members who can see the content (joined before it was posted).
// - Archiving / unarchiving a circle (client 10/14 p.24) → everyone in it except the owner, Public and
//   Private, once per change (claim_circle_archive_push). Someone who turned off every switch they
//   have for that circle gets no push (the change is still recorded for the notifications list).
// - Joining a Public circle (client 10/14 p.9) → its owner, unless their "New members" switch is
//   off; joins within 10 minutes are combined (claim_circle_join_digest; the circle-join-digest sweep
//   sends the gathered ones).
// - Being removed, a denied request, joining a Private circle (the owner approved it) and moderation
//   removals send nothing, on purpose.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import {
  archiveNoticeCopy,
  archiveNoticeData,
  isUuid,
  mutedCircleFilter,
  type ArchiveNoticeKind,
} from '../_shared/circleNotices.ts';
import { deliverJoinDigest } from '../_shared/joinDigest.ts';
import { recordNotices } from '../_shared/notificationsList.ts';
import {
  anySwitchOn,
  joinApprovedCopy,
  joinRequestCopy,
  postPushCopy,
  reactionCopy,
  recipientsFor,
  sharedEntryCopy,
  switchOn,
  type CircleSwitch,
  type CircleSwitchRow,
} from '../_shared/pushCopy.ts';
import { sharePushData, sharePushGroups, type ShareCircle } from './sharePush.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

// deno-lint-ignore no-explicit-any
type Admin = any;

const PAGE = 1000; // PostgREST's default max rows per request
const ID_CHUNK = 200; // ids per `in (...)` filter, so a big circle never overflows the request URL

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Every `user_id` a query returns, page by page (a big circle has more than one page). */
async function allUserIds(
  page: (from: number, to: number) => Promise<{ data: { user_id: string }[] | null }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    const rows = data ?? [];
    for (const r of rows) ids.push(r.user_id);
    if (rows.length < PAGE) return ids;
  }
}

async function tokensFor(admin: Admin, userIds: string[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const ids of chunk([...new Set(userIds)], ID_CHUNK)) {
    const { data } = await admin
      .from('device_tokens')
      .select('token')
      .in('user_id', ids)
      .eq('enabled', true);
    for (const t of data ?? []) tokens.push(t.token);
  }
  return tokens;
}

/**
 * Everyone approved in a circle. With `joinedBy`, only those who had joined by then: in a Private
 * circle a member sees only what was posted after they joined, so nobody is told about a post they
 * can't open.
 */
function approvedMembers(admin: Admin, circleId: string, joinedBy?: string): Promise<string[]> {
  return allUserIds((from, to) => {
    let q = admin
      .from('circle_members')
      .select('user_id')
      .eq('circle_id', circleId)
      .eq('status', 'approved');
    if (joinedBy) q = q.lte('approved_at', joinedBy);
    return q.order('user_id').range(from, to);
  });
}

/** One push per event, whatever the app sends: false = this was already announced. */
async function claimOnce(admin: Admin, fn: string, args: Record<string, string>): Promise<boolean> {
  const { data, error } = await admin.rpc(fn, args);
  return !error && data === true;
}

async function isApprovedMember(
  admin: Admin,
  circleId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle();
  return !!data;
}

/** Everyone in a circle who switched this push OFF. */
function switchedOff(
  admin: Admin,
  circleId: string,
  key: CircleSwitch,
): Promise<string[]> {
  return allUserIds((from, to) =>
    admin
      .from('circle_notification_prefs')
      .select('user_id')
      .eq('circle_id', circleId)
      .eq(key, false)
      .order('user_id')
      .range(from, to),
  );
}

/**
 * Everyone in a circle who turned off EVERY switch they have there ("notifications off for that
 * circle"): rows where each of those switches is false. No row = all on.
 */
function mutedMembers(admin: Admin, circleId: string, isPublic: boolean): Promise<string[]> {
  return allUserIds((from, to) =>
    admin
      .from('circle_notification_prefs')
      .select('user_id')
      .eq('circle_id', circleId)
      .match(mutedCircleFilter(isPublic))
      .order('user_id')
      .range(from, to),
  );
}

/** One person's switch rows for the given circles. */
async function switchRows(
  admin: Admin,
  userId: string,
  circleIds: string[],
): Promise<CircleSwitchRow[]> {
  if (circleIds.length === 0) return [];
  const { data } = await admin
    .from('circle_notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .in('circle_id', circleIds);
  return data ?? [];
}

/**
 * Sends one push to these people's devices and returns how many Expo accepted. Tokens Expo reports
 * as unregistered are disabled (idempotent cleanup). It is also saved to each person's in-app
 * notifications list (client 10/14 p.8), phone or no phone, unless `saved` says the caller already
 * did (archiving saves it for more people than it pushes to).
 */
async function deliver(
  admin: Admin,
  userIds: string[],
  copy: { title: string; body: string },
  data: Record<string, string>,
  { actorId = null, saved = false }: { actorId?: string | null; saved?: boolean } = {},
): Promise<number> {
  if (userIds.length === 0) return 0;
  if (!saved) {
    await recordNotices(admin, userIds, { kind: data.type ?? 'other', ...copy, data, actorId });
  }
  const tokens = await tokensFor(admin, userIds);
  const { sent, invalidTokens } = await sendExpoPush(tokens, copy.title, copy.body, data);
  if (invalidTokens.length > 0) {
    await admin.from('device_tokens').update({ enabled: false }).in('token', invalidTokens);
  }
  return sent;
}

/** True the first time this person reacts to this entry/post (atomic ledger claim). */
async function firstReaction(
  admin: Admin,
  kind: 'entry' | 'post',
  targetId: string,
  reactorId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_reaction_push', {
    p_kind: kind,
    p_target: targetId,
    p_reactor: reactorId,
  });
  return !error && data === true;
}

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const actor = userData.user;
    if (!actor) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const type = body.type as string;
    const nothing = () => json({ status: 'ok', sent: 0 });
    // "Seen by" read receipts were removed (client request). Builds already installed still send
    // this event on every view — answer it as a no-op so nobody is notified and nothing errors.
    if (type === 'view') return nothing();
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', actor.id)
      .maybeSingle();
    const actorName = actorProfile?.display_name ?? 'Someone';

    let recipients: string[] = [];
    let copy = { title: '', body: '' };
    // Deep-link payload delivered with the push.
    const pushData: Record<string, string> = { type };

    if (type === 'reaction') {
      // Someone's first reaction to your shared entry.
      const { data: entry } = await admin
        .from('journal_entries')
        .select('user_id')
        .eq('id', body.entry_id)
        .maybeSingle();
      if (!entry || entry.user_id === actor.id) return nothing();
      const { data: reaction } = await admin
        .from('reactions')
        .select('id')
        .eq('entry_id', body.entry_id)
        .eq('user_id', actor.id)
        .maybeSingle();
      if (!reaction) return nothing();
      // The circles it was seen in: shared there AND the reactor is a member there.
      const { data: shares } = await admin
        .from('circle_posts')
        .select('circle_id')
        .eq('entry_id', body.entry_id);
      const sharedIn = [
        ...new Set((shares ?? []).map((s: { circle_id: string }) => s.circle_id)),
      ];
      if (sharedIn.length === 0) return nothing();
      const { data: mine } = await admin
        .from('circle_members')
        .select('circle_id')
        .eq('user_id', actor.id)
        .eq('status', 'approved')
        .in('circle_id', sharedIn);
      const via = (mine ?? []).map((m: { circle_id: string }) => m.circle_id);
      if (via.length === 0) return nothing();
      if (!(await firstReaction(admin, 'entry', body.entry_id, actor.id)))
        return nothing();
      if (anySwitchOn(await switchRows(admin, entry.user_id, via), via, 'reactions')) {
        recipients = [entry.user_id];
      }
      copy = reactionCopy('entry', actorName);
      pushData.entry_id = body.entry_id;
    } else if (type === 'post_reaction') {
      // Someone's first heart on your circle post / prompt / reply / shared entry.
      const { data: post } = await admin
        .from('circle_posts')
        .select('author_id, circle_id, deleted_at, entry_id')
        .eq('id', body.post_id)
        .maybeSingle();
      if (!post?.author_id || post.author_id === actor.id || post.deleted_at)
        return nothing();
      const { data: heart } = await admin
        .from('post_reactions')
        .select('id')
        .eq('post_id', body.post_id)
        .eq('user_id', actor.id)
        .maybeSingle();
      if (!heart) return nothing();
      if (!(await firstReaction(admin, 'post', body.post_id, actor.id))) return nothing();
      if (!(await isApprovedMember(admin, post.circle_id, post.author_id)))
        return nothing();
      const [row] = await switchRows(admin, post.author_id, [post.circle_id]);
      if (switchOn(row, 'reactions')) recipients = [post.author_id];
      copy = reactionCopy(post.entry_id ? 'entry' : 'post', actorName);
      pushData.circle_id = post.circle_id;
      pushData.post_id = body.post_id;
    } else if (type === 'share_created') {
      // A journal entry shared into Private circles (the only kind that takes entries) → their
      // members. Once per entry per circle, and only once members can see it: a share of the AI
      // reflection waits for the reflection, and the app sends this again when it's ready.
      const { data: entry } = await admin
        .from('journal_entries')
        .select('id, user_id')
        .eq('id', body.entry_id)
        .maybeSingle();
      if (!entry || entry.user_id !== actor.id) return nothing();
      const { data: shares } = await admin
        .from('circle_posts')
        .select('id, circle_id, created_at')
        .eq('entry_id', entry.id)
        .eq('author_id', actor.id)
        .not('body', 'is', null);
      const shareIn = new Map(
        ((shares ?? []) as { id: string; circle_id: string; created_at: string }[]).map((s) => [
          s.circle_id,
          s,
        ]),
      );
      const circleIds = [...shareIn.keys()];
      if (circleIds.length === 0) return nothing();
      const { data: privateCircles } = await admin
        .from('circles')
        .select('id')
        .in('id', circleIds)
        .eq('type', 'private');
      const privateIds = ((privateCircles ?? []) as { id: string }[]).map((c) => c.id);
      if (privateIds.length === 0) return nothing();
      const { data: fresh, error: claimError } = await admin.rpc('claim_share_pushes', {
        p_entry: entry.id,
        p_circles: privateIds,
      });
      if (claimError) return nothing();
      const perCircle: ShareCircle[] = [];
      for (const id of (fresh ?? []) as string[]) {
        const share = shareIn.get(id);
        perCircle.push({
          circleId: id,
          postId: share?.id ?? null,
          memberIds: await approvedMembers(admin, id, share?.created_at),
          offIds: await switchedOff(admin, id, 'new_entries'),
        });
      }
      // One push per circle, each naming its circle (and post) so a tap can open it; a person in
      // several of these circles is told once. Builds that read only `type` still work as before.
      const shareCopy = sharedEntryCopy(actorName);
      let sent = 0;
      for (const group of sharePushGroups(perCircle, actor.id)) {
        sent += await deliver(admin, group.recipients, shareCopy, sharePushData(entry.id, group), {
          actorId: actor.id,
        });
      }
      return json({ status: 'ok', sent });
    } else if (type === 'added_to_circle') {
      // Join request approved — mandatory, no switch. Only the circle's owner approves, and the
      // person must now really be a member.
      const { data: circle } = await admin
        .from('circles')
        .select('name, owner_id')
        .eq('id', body.circle_id)
        .maybeSingle();
      if (!circle || circle.owner_id !== actor.id) return nothing();
      if (!body.user_id || body.user_id === actor.id) return nothing();
      if (!(await isApprovedMember(admin, body.circle_id, body.user_id)))
        return nothing();
      if (
        !(await claimOnce(admin, 'claim_approval_push', {
          p_circle: body.circle_id,
          p_user: body.user_id,
        }))
      )
        return nothing();
      recipients = [body.user_id];
      copy = joinApprovedCopy(circle.name ?? 'your circle');
      pushData.circle_id = body.circle_id;
    } else if (type === 'post_created') {
      const { data: post } = await admin
        .from('circle_posts')
        .select('parent_id, circle_id, author_id, deleted_at, entry_id, mention_user_id')
        .eq('id', body.post_id)
        .maybeSingle();
      if (!post || post.author_id !== actor.id || post.deleted_at) return nothing();
      if (post.entry_id) return nothing(); // shared entries are announced by share_created
      if (!(await claimOnce(admin, 'claim_post_push', { p_post: body.post_id }))) return nothing();
      const { data: circle } = await admin
        .from('circles')
        .select('name, type')
        .eq('id', post.circle_id)
        .maybeSingle();
      const circleName = circle?.name ?? 'your circle';
      pushData.circle_id = post.circle_id;
      pushData.post_id = body.post_id;

      if (post.parent_id) {
        // A reply → the person it answers, while still in the circle: the "@" person when it answers
        // someone's reply inside a group, else the author of the post / prompt it sits under.
        let to: string | null = post.mention_user_id ?? null;
        if (!to) {
          const { data: parent } = await admin
            .from('circle_posts')
            .select('author_id')
            .eq('id', post.parent_id)
            .maybeSingle();
          to = parent?.author_id ?? null;
        }
        if (
          to &&
          to !== actor.id &&
          (await isApprovedMember(admin, post.circle_id, to))
        ) {
          const [row] = await switchRows(admin, to, [post.circle_id]);
          if (switchOn(row, 'replies')) recipients = [to];
        }
        copy = postPushCopy('reply', actorName, circleName);
      } else {
        // Top-level: Public = the creator's new prompt; Private = anyone's new post.
        const isPrivate = circle?.type === 'private';
        const key: CircleSwitch = isPrivate ? 'new_posts' : 'new_prompts';
        recipients = recipientsFor(
          await approvedMembers(admin, post.circle_id),
          actor.id,
          await switchedOff(admin, post.circle_id, key),
        );
        copy = postPushCopy(isPrivate ? 'new_post' : 'new_prompt', actorName, circleName);
      }
    } else if (type === 'join_request') {
      // Someone asked to join a Private circle → its owner.
      const { data: circle } = await admin
        .from('circles')
        .select('name, owner_id')
        .eq('id', body.circle_id)
        .maybeSingle();
      if (!circle?.owner_id || circle.owner_id === actor.id) return nothing();
      const { data: request } = await admin
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', body.circle_id)
        .eq('user_id', actor.id)
        .eq('status', 'requested')
        .maybeSingle();
      if (!request) return nothing();
      // Re-entering the code (or asking again after a denial) tells the owner at most once a day.
      if (
        !(await claimOnce(admin, 'claim_join_request_push', {
          p_circle: body.circle_id,
          p_requester: actor.id,
        }))
      )
        return nothing();
      const [row] = await switchRows(admin, circle.owner_id, [body.circle_id]);
      if (switchOn(row, 'join_requests')) recipients = [circle.owner_id];
      copy = joinRequestCopy(actorName, circle.name ?? 'your circle');
      pushData.circle_id = body.circle_id;
    } else if (type === 'circle_archived' || type === 'circle_unarchived') {
      // The owner archived or unarchived their circle → everyone else in it. The claim announces the
      // circle's newest change once, only if it is still the circle's state and members haven't
      // heard it yet, so a late or repeated call can never announce the wrong thing.
      if (!isUuid(body.circle_id)) return nothing();
      const { data: circle } = await admin
        .from('circles')
        .select('name, owner_id, type')
        .eq('id', body.circle_id)
        .maybeSingle();
      if (!circle || circle.owner_id !== actor.id) return nothing();
      const { data: claimed, error: claimError } = await admin.rpc('claim_circle_archive_push', {
        p_circle: body.circle_id,
      });
      if (claimError || (claimed !== 'archived' && claimed !== 'unarchived')) return nothing();
      const kind = claimed as ArchiveNoticeKind;
      const everyone = await approvedMembers(admin, body.circle_id);
      recipients = recipientsFor(
        everyone,
        actor.id,
        await mutedMembers(admin, body.circle_id, circle.type === 'public'),
      );
      copy = archiveNoticeCopy(kind, circle.name ?? 'Your circle');
      Object.assign(pushData, archiveNoticeData(kind, body.circle_id));
      // Everyone but the owner sees it in their notifications list, those who turned this circle's
      // notifications off included; only the others get the push (client 10/14 p.24).
      await recordNotices(admin, recipientsFor(everyone, actor.id, []), {
        kind: pushData.type,
        ...copy,
        data: pushData,
        actorId: actor.id,
      });
      if (recipients.length === 0) return nothing();
      return json({
        status: 'ok',
        sent: await deliver(admin, recipients, copy, pushData, { saved: true }),
      });
    } else if (type === 'member_joined') {
      // The caller just joined a Public circle → its owner (joins close together combined; the
      // claim inside decides, so repeated calls never send twice).
      if (!isUuid(body.circle_id)) return nothing();
      if (!(await isApprovedMember(admin, body.circle_id, actor.id))) return nothing();
      return json({ status: 'ok', sent: await deliverJoinDigest(admin, body.circle_id) });
    } else {
      return json({ error: 'unknown_type' }, 400);
    }

    if (recipients.length === 0) return nothing();
    return json({
      status: 'ok',
      sent: await deliver(admin, recipients, copy, pushData, { actorId: actor.id }),
    });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
