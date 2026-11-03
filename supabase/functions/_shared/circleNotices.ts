// Pure copy and rules for two circle notices (client revisions 10/14):
//  * archive / unarchive (p.24): to everyone in the circle except the owner, Public and Private;
//  * new members (p.9): to a Public circle's owner, joins close together combined into one.
// No I/O and no Deno APIs: send-push and circle-join-digest call these, and Jest imports this module
// directly (the SAME source the tests exercise).

export type ArchiveNoticeKind = 'archived' | 'unarchived';

/** The push for an archived / unarchived circle. The body is the client's text, word for word. */
export function archiveNoticeCopy(
  kind: ArchiveNoticeKind,
  circleName: string,
): { title: string; body: string } {
  return kind === 'archived'
    ? {
        title: 'Circle archived',
        body: `${circleName} has been archived. You can still read it, but no new posts can be added.`,
      }
    : {
        title: 'Circle active again',
        body: `${circleName} is active again. You can post and reply again.`,
      };
}

/**
 * The owner's push for people joining their Public circle: "[Name] joined [Circle name]." for one
 * person, "[Name] and [N] others joined [Circle name]." for several (N = everyone else who joined
 * in the same 10 minutes; "1 other" reads right for two people).
 */
export function joinNoticeCopy(
  name: string,
  joinedCount: number,
  circleName: string,
): { title: string; body: string } {
  const others = Math.max(0, Math.floor(joinedCount) - 1);
  if (others === 0) return { title: 'New member', body: `${name} joined ${circleName}.` };
  const count = others.toLocaleString('en-US');
  return {
    title: 'New members',
    body: `${name} and ${count} ${others === 1 ? 'other' : 'others'} joined ${circleName}.`,
  };
}

/** Where tapping a notice goes: the push data the app reads. Joins open the circle's Members tab. */
export function archiveNoticeData(kind: ArchiveNoticeKind, circleId: string): Record<string, string> {
  return { type: kind === 'archived' ? 'circle_archived' : 'circle_unarchived', circle_id: circleId };
}

export function joinNoticeData(circleId: string): Record<string, string> {
  return { type: 'member_joined', circle_id: circleId, tab: 'members' };
}

export type MemberSwitch = 'replies' | 'reactions' | 'new_prompts' | 'new_posts' | 'new_entries';

/**
 * The switches a member who isn't the owner has for a circle on its bell screen: Public = replies,
 * reactions, new prompts; Private = replies, reactions, new shared entries, new posts.
 */
export function memberSwitchKeys(isPublic: boolean): MemberSwitch[] {
  return isPublic
    ? ['replies', 'reactions', 'new_prompts']
    : ['replies', 'reactions', 'new_entries', 'new_posts'];
}

/**
 * "Notifications turned off for that circle" (p.24): every switch the member has there is off. They
 * then get no push for an archive / unarchive (it is still recorded for the notifications list).
 * This is the row filter send-push matches (`.match(...)`) to find them: a member with no saved row,
 * or with any of these switches still on, isn't matched and gets the push.
 */
export function mutedCircleFilter(isPublic: boolean): Partial<Record<MemberSwitch, false>> {
  const filter: Partial<Record<MemberSwitch, false>> = {};
  for (const k of memberSwitchKeys(isPublic)) filter[k] = false;
  return filter;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Re-validates an id sent by the app before it reaches a query. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
