import { z } from 'zod';
import type { PostgrestError, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@lib';
import { chunk } from '@utils/chunk';
import type {
  Circle,
  CircleMember,
  CircleReflectionStyle,
  CircleType,
  Database,
  MemberRole,
  MemberStatus,
} from '@app-types/database';
import { resolveCircleSwitches, type CircleNotificationPrefs } from './notificationSwitches';
import { activityFor, sortMyCircles, type CircleRowChange } from './myCirclesOrder';

type CircleNotificationPrefsInsert =
  Database['public']['Tables']['circle_notification_prefs']['Insert'];

export interface MyCircle extends Circle {
  role: MemberRole;
  /** When the user joined (or created) the circle. */
  joined_at: string | null;
  /**
   * Its place in Your Circles: the newer of its last post or reply (from anyone) and when the user
   * joined or created it (client 10/14 p.2).
   */
  activity_at: string;
}

/**
 * RPCs added after src/types/database.ts was generated (shared file, regenerated separately). Their
 * results are checked with Zod below, so the shape is still verified at runtime.
 */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
/**
 * Looks the client's rpc up when called, not when this module loads: importing the circles API never
 * touches the client (screens and tests that load it without calling an RPC stay unaffected).
 */
function rpcUntyped(fn: string, args: Record<string, unknown>) {
  return (supabase.rpc.bind(supabase) as unknown as UntypedRpc)(fn, args);
}

/** One row of my_circles_by_activity: the circle, the user's role, and its place in the list. */
const myCircleRow = z.object({
  id: z.string().min(1),
  owner_id: z.string().nullable(),
  name: z.string(),
  type: z.enum(['public', 'private']),
  invite_code: z.string(),
  invite_link_slug: z.string().nullable(),
  // A retired setting the list doesn't use: any value is fine (a new one must never empty the list).
  circle_reflection_style: z.custom<CircleReflectionStyle>((v) => typeof v === 'string'),
  description: z.string().nullable(),
  member_count: z.number().int(),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  last_activity_at: z.string(),
  role: z.enum(['owner', 'member']),
  joined_at: z.string().nullable(),
  activity_at: z.string(),
});

/** Rows per request when reading Your Circles (the server caps a page at 200). */
const MY_CIRCLES_PAGE = 100;

export interface MemberProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** The admin-only verified badge (N7), read live with each load. Absent = not verified. */
  verified?: boolean;
}

export interface MemberWithProfile {
  membership: CircleMember;
  profile: MemberProfile | null;
}

export async function createCircle(
  ownerId: string,
  name: string,
  type: CircleType,
  description?: string | null,
): Promise<Circle> {
  const { data, error } = await supabase
    .from('circles')
    .insert({
      owner_id: ownerId,
      name: name.trim(),
      type,
      description: description?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface CirclePatch {
  name?: string;
  /** Public circles only (the ones people can discover). */
  description?: string | null;
}

/** Owner-only (enforced by RLS circles_update_owner). Edits the circle's name/description. */
export async function updateCircle(circleId: string, patch: CirclePatch): Promise<Circle> {
  const clean: CirclePatch = { ...patch };
  if (clean.name !== undefined) clean.name = clean.name.trim();
  if (clean.description !== undefined) clean.description = clean.description?.trim() || null;
  const { data, error } = await supabase
    .from('circles')
    .update(clean)
    .eq('id', circleId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Every circle the user is in, in Your Circles order (client 10/14 p.2): most recent activity first,
 * archived circles last. Read page by page (keyset on the server's sort key), so a long list never
 * needs one huge request.
 */
export async function fetchMyCircles(userId: string): Promise<MyCircle[]> {
  const out: MyCircle[] = [];
  let after: { archived: boolean; activity: string; id: string } | null = null;
  for (;;) {
    const { data, error } = await rpcUntyped('my_circles_by_activity', {
      p_limit: MY_CIRCLES_PAGE,
      p_after_archived: after?.archived ?? null,
      p_after_activity: after?.activity ?? null,
      p_after_id: after?.id ?? null,
    });
    if (error) {
      // The server doesn't have the list function yet (the app was updated first): read it the
      // older way, ordered here.
      if (out.length === 0 && error.code === 'PGRST202') return fetchMyCirclesDirect(userId);
      throw error;
    }
    const rows = z.array(myCircleRow).parse(data ?? []);
    out.push(...rows);
    const last = rows[rows.length - 1];
    if (!last || rows.length < MY_CIRCLES_PAGE) return out;
    after = { archived: !!last.archived_at, activity: last.activity_at, id: last.id };
  }
}

/** Your Circles from the tables directly, for a server without my_circles_by_activity. */
async function fetchMyCirclesDirect(userId: string): Promise<MyCircle[]> {
  const { data: mems, error } = await supabase
    .from('circle_members')
    .select('circle_id, role, approved_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (error) throw error;
  if (!mems || mems.length === 0) return [];

  const byId = new Map(mems.map((m) => [m.circle_id, m]));
  const batches = await Promise.all(
    chunk(mems.map((m) => m.circle_id)).map(async (ids) => {
      const { data: circles, error: ce } = await supabase.from('circles').select('*').in('id', ids);
      if (ce) throw ce;
      return circles ?? [];
    }),
  );
  return sortMyCircles(
    batches.flat().map((c) => {
      const m = byId.get(c.id);
      const joined = m?.approved_at ?? m?.created_at ?? null;
      const last = (c as Circle & { last_activity_at?: string | null }).last_activity_at;
      return {
        ...c,
        role: m?.role ?? 'member',
        joined_at: joined,
        activity_at: activityFor(last ?? c.created_at, joined),
      };
    }),
  );
}

let myCirclesChannelSeq = 0;

/** A live change to one of the user's circles (only the columns the list uses are read). */
const circleChangeRow = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  member_count: z.number().int().optional(),
  archived_at: z.string().nullable().optional(),
  last_activity_at: z.string().nullable().optional(),
  owner_id: z.string().nullable().optional(),
});

/**
 * Live changes for Your Circles while the Circles tab is open (client 10/14 p.2: "The order should
 * update in real time"): any change to one of the user's circles (a new post or reply moves its
 * activity forward, archived / unarchived, renamed) and any change to the user's own memberships
 * (let into a circle). Returns the function that stops listening.
 */
export function subscribeToMyCircles(
  userId: string,
  circleIds: readonly string[],
  handlers: {
    onCircleChange: (change: CircleRowChange) => void;
    onMembershipChange: () => void;
    /** Connected again after a drop: changes may have been missed. */
    onResubscribed: () => void;
  },
): () => void {
  // A fresh topic each time: listening again (the circles changed) never reuses a channel that is
  // still closing.
  myCirclesChannelSeq += 1;
  const topic = `my-circles:${userId}:${myCirclesChannelSeq}`;
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  // The server checks each change against the signed-in person's access (RLS), so the session's
  // token goes to Realtime before listening (as the circle page's live channel does).
  const ready = (async () => {
    await supabase.realtime.setAuth();
    if (stopped) return;
    const ch = supabase.channel(topic);
    // A filter takes at most 100 ids.
    for (const ids of chunk(circleIds, 100)) {
      ch.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'circles', filter: `id=in.(${ids.join(',')})` },
        (payload) => {
          const row = circleChangeRow.safeParse(payload.new);
          if (row.success) handlers.onCircleChange(row.data);
        },
      );
    }
    for (const event of ['INSERT', 'UPDATE'] as const) {
      ch.on(
        'postgres_changes',
        { event, schema: 'public', table: 'circle_members', filter: `user_id=eq.${userId}` },
        () => handlers.onMembershipChange(),
      );
    }
    let joinedOnce = false;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (joinedOnce) handlers.onResubscribed();
      joinedOnce = true;
    });
    channel = ch;
  })().catch(() => {
    // No live updates this time; the list still loads, and reloads when the app comes back.
  });

  return () => {
    stopped = true;
    void ready.then(() => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    });
  };
}

/** Public Circles for the Discovery screen, most members first. Archived ones are left out. */
export async function fetchPublicCircles(): Promise<Circle[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .eq('type', 'public')
    .is('archived_at', null)
    .order('member_count', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** The server refused a join: the circle has been archived, so no one new can join. */
export class CircleArchivedError extends Error {
  constructor() {
    super('This circle has been archived, so no one new can join.');
    this.name = 'CircleArchivedError';
  }
}

const isArchivedRefusal = (e: { message?: string } | null | undefined) =>
  !!e?.message?.includes('circle_archived');

/** Open-join a Public Circle (instant, approved). Idempotent; the ban policy blocks banned users. */
export async function joinCircle(circleId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('circle_members')
    .upsert(
      { circle_id: circleId, user_id: userId, status: 'approved', role: 'member' },
      { onConflict: 'circle_id,user_id' },
    );
  if (error) {
    if (isArchivedRefusal(error)) throw new CircleArchivedError();
    throw error;
  }
}

/**
 * Ban a user from a Circle (Public creator power). A real ban: records the ban AND removes their
 * membership so the Phase-1 RESTRICTIVE policy blocks any rejoin of this open Circle.
 */
export async function banFromCircle(
  circleId: string,
  userId: string,
  bannedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('circle_bans')
    .upsert(
      { circle_id: circleId, user_id: userId, banned_by: bannedBy },
      { onConflict: 'circle_id,user_id' },
    );
  if (error) throw error;
  await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId);
}

/**
 * Archive a circle the current user owns, Public or Private (client 10/14 p.23): everything stays
 * readable, no one can post or reply, a Public one leaves Discover and no one new can join. The
 * server sets the archive time (the value sent here is replaced) and RLS checks the owner. Owner
 * ACCOUNT deletion archives automatically via a DB trigger.
 */
export async function archiveCircle(circleId: string): Promise<void> {
  const { error } = await supabase
    .from('circles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', circleId);
  if (error) throw error;
}

/** Unarchive a circle the current user owns: back to normal (client 10/14 p.23). */
export async function unarchiveCircle(circleId: string): Promise<void> {
  const { error } = await supabase.from('circles').update({ archived_at: null }).eq('id', circleId);
  if (error) throw error;
}

/**
 * Circle notices send-push fans out server-side (it re-checks everything against the database):
 * the owner archived / unarchived their circle (→ everyone else in it), or the user just joined a
 * Public circle (→ its owner, joins close together combined).
 */
export type CircleNoticeEvent =
  | { type: 'circle_archived'; circle_id: string }
  | { type: 'circle_unarchived'; circle_id: string }
  | { type: 'member_joined'; circle_id: string };

/** Fire-and-forget, like every other push: never throws and never blocks the user's action. */
export async function notifyCircleEvent(event: CircleNoticeEvent): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: event });
  } catch {
    // best-effort
  }
}

/** The server refused: a Public circle with 5 or more members can only be archived. */
export class CircleTooBigToDeleteError extends Error {
  constructor() {
    super('This circle has 5 or more members, so it can only be archived.');
    this.name = 'CircleTooBigToDeleteError';
  }
}

/**
 * Delete a circle the current user owns, and everything in it, for all members. delete_circle
 * checks the owner and, for a Public circle, that it still has fewer than 5 members.
 */
export async function deleteCircle(circleId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_circle', { p_circle: circleId });
  if (error) {
    if (error.message?.includes('circle_too_big_to_delete')) throw new CircleTooBigToDeleteError();
    throw error;
  }
}

/** This person's notification switches for one circle. No saved row = every switch ON. */
export async function fetchCircleNotificationPrefs(
  circleId: string,
  userId: string,
): Promise<CircleNotificationPrefs> {
  // Every column, so a server without a newer switch column still loads (it reads as ON).
  const { data, error } = await supabase
    .from('circle_notification_prefs')
    .select('*')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return resolveCircleSwitches(data);
}

/** Save some of this person's switches for one circle (the rest keep their saved/default value). */
export async function updateCircleNotificationPrefs(
  circleId: string,
  userId: string,
  patch: Partial<CircleNotificationPrefs>,
): Promise<void> {
  // The "New members" column (migration 20261022042000) isn't in the shared generated types
  // (src/types/database.ts) yet; the row is otherwise exactly the table's insert shape.
  const row = { user_id: userId, circle_id: circleId, ...patch } as CircleNotificationPrefsInsert;
  const { error } = await supabase
    .from('circle_notification_prefs')
    .upsert(row, { onConflict: 'user_id,circle_id' });
  if (error) throw error;
}

export async function fetchCircle(circleId: string): Promise<Circle | null> {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .eq('id', circleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMembers(circleId: string): Promise<MemberWithProfile[]> {
  const { data: members, error } = await supabase
    .from('circle_members')
    .select('*')
    .eq('circle_id', circleId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  // Profiles in batches (a big Public circle's ids would overflow one request), and a failed
  // lookup fails the load rather than listing everyone without a name.
  const ids = (members ?? []).map((m) => m.user_id);
  const batches = await Promise.all(
    chunk(ids).map(async (batch) => {
      const { data: profs, error: pe } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, bio, verified')
        .in('user_id', batch);
      if (pe) throw pe;
      // `verified` (migration 20261022060000) isn't in the shared generated types yet.
      return (profs ?? []) as unknown as MemberProfile[];
    }),
  );
  const profiles: MemberProfile[] = batches.flat();
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return (members ?? []).map((m) => ({ membership: m, profile: byId.get(m.user_id) ?? null }));
}

export type JoinByCodeResult = { circleId: string; status: MemberStatus; name: string };

/**
 * Redeem an invite code. A PUBLIC circle joins immediately (`status: 'approved'`); a PRIVATE circle
 * joins as `'requested'` — pending the owner's approval, so the caller can't yet read the circle.
 * Returns null when the code matches no circle (or the caller is banned). Throws
 * CircleArchivedError when the circle is archived and the caller isn't in it.
 */
export async function joinByCode(code: string): Promise<JoinByCodeResult | null> {
  const { data, error } = await supabase.rpc('redeem_invite_code', { code });
  if (error) {
    if (isArchivedRefusal(error)) throw new CircleArchivedError();
    throw error;
  }
  if (!data) return null;
  return { circleId: data.circle_id, status: data.status, name: data.name };
}

export async function setMemberStatus(
  memberId: string,
  status: MemberStatus,
): Promise<void> {
  const { error } = await supabase
    .from('circle_members')
    .update({ status })
    .eq('id', memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('circle_members').delete().eq('id', memberId);
  if (error) throw error;
}

export async function leaveCircle(circleId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId);
  if (error) throw error;
}

export interface InviteOptions {
  /** Nickname shown to the inviter + used to personalize the email greeting. */
  name?: string | null;
}

export async function inviteByEmail(
  circleId: string,
  email: string,
  opts: InviteOptions = {},
): Promise<void> {
  const { error } = await supabase.functions.invoke('send-invite', {
    body: {
      circle_id: circleId,
      email: email.trim().toLowerCase(),
      invitee_name: opts.name?.trim() || null,
    },
  });
  if (error) throw error;
}
