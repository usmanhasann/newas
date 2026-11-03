/**
 * Circles Posts — pure, framework-free permission + display logic (the client mirror of the
 * can_post_in_circle SQL / RLS). Single tested source of truth for what the UI enables; the server
 * re-enforces via RLS.
 */
import type { CircleStanding } from '@app-types/database';

export interface CirclePermInput {
  circleType: 'public' | 'private';
  /** The current user owns this Circle. */
  isOwner: boolean;
  /** The current user is an APPROVED member. */
  isMember: boolean;
  /** The current user is banned from this Circle (Public ban). */
  isBanned: boolean;
  /** The Circle is archived (by its owner, or because the owner deleted their account). */
  archived: boolean;
  /** The current user's global Circles standing (moderation). */
  standing: CircleStanding;
}

export interface CirclePerms {
  /** May start a new top-level post/prompt. */
  canPostTopLevel: boolean;
  /** May reply to an existing post/reply. */
  canReply: boolean;
  /** May heart a post/reply. */
  canReact: boolean;
}

/**
 * Who may do what in a Circle's Posts tab.
 *  - Public: only the owner starts top-level posts; any member replies.
 *  - Private: any member starts top-level posts and replies.
 *  - A restricted user can't post/reply; a suspended user can't do anything (can't view either);
 *    a banned user can do nothing.
 *  - An archived Circle (Public or Private) takes no new posts and no replies (client 10/14 p.23:
 *    "No one can post or reply anymore"); everything in it stays readable, and hearts still work.
 *    Unarchiving brings posting and replies back.
 */
export function circlePostPermissions(i: CirclePermInput): CirclePerms {
  const canParticipate = i.isMember && !i.isBanned && i.standing === 'ok' && !i.archived;
  return {
    canPostTopLevel: canParticipate && (i.circleType === 'public' ? i.isOwner : true),
    canReply: canParticipate,
    // Hearting is light: a restricted user may still react; only a ban or suspension removes it.
    canReact: i.isMember && !i.isBanned && i.standing !== 'suspended',
  };
}

/**
 * What to tell a user whose moderation standing blocks posting (no silent penalties) — shown where
 * the composer / reply box would be. null when nothing is blocked.
 */
export function standingNotice(standing: CircleStanding): string | null {
  if (standing === 'suspended') {
    return 'Posting in Circles is paused for your account while a post is reviewed. Your journal, check-ins and reflections aren’t affected.';
  }
  if (standing === 'restricted') {
    return 'You can’t post or reply for a short while after a recent post was removed. You can still react to posts.';
  }
  return null;
}

/** A Public circle can be deleted only while it has FEWER members than this (owner included). */
export const PUBLIC_CIRCLE_DELETE_LIMIT = 5;

export interface CircleEndActions {
  /** Show "Archive circle". */
  archive: boolean;
  /** Show "Unarchive circle" (in place of Archive, once the circle is archived). */
  unarchive: boolean;
  /** Show "Delete circle". */
  delete: boolean;
}

/**
 * The archive and delete buttons in Circle Settings (owner only):
 *  - Archive for Public and Private circles at any size, next to Delete (client 10/14 p.23); once
 *    the circle is archived it becomes Unarchive.
 *  - Delete: Private at any size; Public only while it has fewer than 5 members, so the Delete
 *    button disappears as soon as a circle grows to 5.
 * The server re-checks the size rule (delete_circle).
 */
export function circleEndActions(i: {
  circleType: 'public' | 'private';
  memberCount: number;
  archived: boolean;
}): CircleEndActions {
  return {
    archive: !i.archived,
    unarchive: i.archived,
    delete: i.circleType === 'private' || i.memberCount < PUBLIC_CIRCLE_DELETE_LIMIT,
  };
}

/** The small label at the top of an archived circle (client 10/14 p.23), word for word. */
export const ARCHIVED_CIRCLE_LABEL = 'This circle has been archived.';

/**
 * The gray line under a circle's name in Your Circles: "Public · Owner", "Private · Member", and
 * with "· Archived" at the end for an archived circle, for everyone in it (client 10/14 p.23-24).
 */
export function circleRoleLine(circle: {
  type: 'public' | 'private';
  role: 'owner' | 'member';
  archived_at: string | null;
}): string {
  const type = circle.type === 'public' ? 'Public' : 'Private';
  const role = circle.role === 'owner' ? 'Owner' : 'Member';
  return circle.archived_at ? `${type} · ${role} · Archived` : `${type} · ${role}`;
}

/**
 * A circle's description: at most 150 characters, spaces included (client 10/14, p.29). Enforced as
 * the field's `maxLength` on Create Circle and Circle Settings, so typing (and pasting) stops at the
 * cap; the database re-checks it. Counted the way `maxLength` counts (string length), so the counter
 * and the cap always agree.
 */
export const CIRCLE_DESCRIPTION_MAX_LENGTH = 150;

/** The live counter right below the description field: "0/150", "45/150", and so on. */
export function circleDescriptionCounter(description: string): string {
  return `${description.length}/${CIRCLE_DESCRIPTION_MAX_LENGTH}`;
}

/**
 * The description shown under a circle's name at the top of its page: Public circles only (client
 * 10/14, p.29). null when there's nothing to show, so the line is left out with no empty gap.
 */
export function circleHeaderDescription(circle: {
  type: 'public' | 'private';
  description: string | null;
}): string | null {
  if (circle.type !== 'public') return null;
  const text = circle.description?.trim();
  return text ? text : null;
}

/**
 * The confirmation before a member leaves a circle (client 10/14, p.17): "Leave [circle name]?",
 * and for a Private circle the reminder that getting back in takes a new invite. A Public circle has
 * no second line (anyone can join it again).
 */
export function leaveCircleQuestion(circle: { name: string; type: 'public' | 'private' }): {
  title: string;
  message: string | undefined;
} {
  return {
    title: `Leave ${circle.name}?`,
    message: circle.type === 'private' ? 'You’ll need a new invite to rejoin.' : undefined,
  };
}

/**
 * Circles tab headline: "[Name]’s Circle" with the user's first name (the same name Home's
 * greeting uses), or "Your Circle" while they have no name set.
 */
export function circlesPageTitle(firstName: string | null): string {
  return firstName ? `${firstName}’s Circle` : 'Your Circle';
}

/**
 * Public discovery ordering: by member count, highest first (spec). Deterministic tie-break —
 * newer Circle first, then name — so the list is stable across reads.
 */
export function sortPublicCirclesByMembers<
  T extends { member_count: number; created_at?: string; name?: string },
>(circles: readonly T[]): T[] {
  return [...circles].sort((a, b) => {
    if (b.member_count !== a.member_count) return b.member_count - a.member_count;
    if (a.created_at && b.created_at && a.created_at !== b.created_at) {
      return a.created_at > b.created_at ? -1 : 1;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

/** "View 1 reply" / "View 12 replies": the collapsed group under a post or reply (spec). */
export function viewRepliesLabel(replyCount: number): string {
  return replyCount === 1 ? 'View 1 reply' : `View ${replyCount.toLocaleString('en-US')} replies`;
}

/**
 * How many items a circle's page previews before the arrow to the full list (spec): a Public
 * circle's 5 newest prompts, a Private circle's 10 newest posts and shared entries.
 */
export function feedPreviewCount(circleType: 'public' | 'private'): number {
  return circleType === 'public' ? 5 : 10;
}

/** A circle in the "Share with a private circle" list. */
export interface ShareTarget {
  id: string;
  name: string;
  /**
   * Set when the entry is still shared there but nothing new can go in (the circle was archived,
   * or the author left it): it can only be taken out.
   */
  removeOnly: 'archived' | 'left' | null;
}

/**
 * Where an entry can be shared: the author's Private circles that are still active, plus every
 * circle it's shared in now even if archived or left since (members there still see it), so it can
 * always be taken out. Archived circles it isn't in are never offered (the server refuses them).
 */
export function entryShareTargets(
  myCircles: readonly {
    id: string;
    name: string;
    type: 'public' | 'private';
    archived_at: string | null;
  }[],
  sharedIn: readonly { circleId: string; circleName: string }[],
): ShareTarget[] {
  const shared = new Set(sharedIn.map((s) => s.circleId));
  const mine = new Set(myCircles.map((c) => c.id));
  const targets: ShareTarget[] = [];
  for (const c of myCircles) {
    if (c.type !== 'private') continue;
    if (c.archived_at && !shared.has(c.id)) continue;
    targets.push({ id: c.id, name: c.name, removeOnly: c.archived_at ? 'archived' : null });
  }
  for (const s of sharedIn) {
    if (!mine.has(s.circleId)) targets.push({ id: s.circleId, name: s.circleName, removeOnly: 'left' });
  }
  return targets;
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Taking a shared entry out of a circle deletes its post there, replies included, so when any of
 * those posts has replies the author is asked first, with the real count. null: nothing to ask
 * (no replies would be lost).
 */
export function unshareQuestion(
  removed: readonly { circleName: string; replyTotal: number }[],
): { title: string; message: string } | null {
  const replies = removed.reduce((n, r) => n + Math.max(0, r.replyTotal), 0);
  if (replies === 0) return null;
  const count = replies === 1 ? '1 reply' : `${replies.toLocaleString('en-US')} replies`;
  return {
    title: 'Stop sharing this entry?',
    message: `It will be removed from ${listNames(removed.map((r) => r.circleName))}, along with ${count}.`,
  };
}

/**
 * The delete confirmation names the real scope (spec): "Delete this post and its 2,847 replies?"
 * Everything under it goes too.
 */
export function deletePostQuestion(kind: 'post' | 'reply', replyTotal: number): string {
  if (replyTotal <= 0) return `Delete this ${kind}?`;
  const replies = replyTotal === 1 ? '1 reply' : `${replyTotal.toLocaleString('en-US')} replies`;
  return `Delete this ${kind} and its ${replies}?`;
}
