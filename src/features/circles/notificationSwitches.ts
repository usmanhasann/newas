/**
 * Each circle's own notification switches (client notifications spec, 2026-09-29). Every circle a
 * person is in has an INDEPENDENT set — settings are per circle, not per circle type. Pure (no React,
 * no I/O) so which switches a person gets is unit-testable. send-push honors the same keys, and no
 * saved row means every switch is ON.
 */

export type CircleSwitchKey =
  | 'replies'
  | 'reactions'
  | 'new_prompts'
  | 'new_posts'
  | 'new_entries'
  | 'join_requests'
  | 'new_members';

export type CircleNotificationPrefs = Record<CircleSwitchKey, boolean>;

export interface CircleSwitchOption {
  key: CircleSwitchKey;
  title: string;
  desc: string;
}

export const CIRCLE_SWITCH_KEYS: readonly CircleSwitchKey[] = [
  'replies',
  'reactions',
  'new_prompts',
  'new_posts',
  'new_entries',
  'join_requests',
  'new_members',
];

/** Saved values over the defaults — every switch starts ON. */
export function resolveCircleSwitches(
  row: Partial<Record<CircleSwitchKey, boolean | null>> | null | undefined,
): CircleNotificationPrefs {
  const prefs = {} as CircleNotificationPrefs;
  for (const key of CIRCLE_SWITCH_KEYS) prefs[key] = row?.[key] ?? true;
  return prefs;
}

/**
 * The switches one person has for one circle.
 * - Public: replies, reactions, and new prompts — for members only (the creator writes them); new
 *   members — for the owner only (client 10/14 p.9: when someone joins, on by default).
 * - Private: replies, reactions, join requests — for the owner only (only they approve) — new
 *   shared entries, and new posts.
 */
export function circleNotificationSwitches({
  isPublic,
  isOwner,
}: {
  isPublic: boolean;
  isOwner: boolean;
}): CircleSwitchOption[] {
  const replies: CircleSwitchOption = {
    key: 'replies',
    title: 'Replies',
    desc: isPublic
      ? 'When someone replies to your post or prompt'
      : 'When someone replies to your post',
  };
  const reactions: CircleSwitchOption = {
    key: 'reactions',
    title: 'Reactions',
    // Public circles take no journal entries: there it's your posts and prompts.
    desc: isPublic
      ? 'When someone reacts to your post or prompt'
      : 'When someone reacts to your post or shared entry',
  };

  if (isPublic) {
    return isOwner
      ? [
          replies,
          reactions,
          // The label is the client's own wording (10/14 p.9).
          { key: 'new_members', title: 'New members', desc: 'When someone joins this circle' },
        ]
      : [
          replies,
          reactions,
          {
            key: 'new_prompts',
            title: 'New Prompts',
            desc: 'When the creator posts a new prompt',
          },
        ];
  }

  return [
    replies,
    reactions,
    ...(isOwner
      ? [
          {
            key: 'join_requests' as const,
            title: 'Join Requests',
            desc: 'When someone asks to join this circle',
          },
        ]
      : []),
    {
      key: 'new_entries',
      title: 'New Shared Entries',
      desc: 'When someone shares a journal entry in this circle',
    },
    { key: 'new_posts', title: 'New Posts', desc: 'When someone posts in this circle' },
  ];
}
