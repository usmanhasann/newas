// Pure notification copy + recipient math for the send-push fan-out. No I/O and no Deno APIs — the
// Edge Function resolves recipients and switch rows via the DB and calls these for the title/body and
// the "who still wants this" filtering; Jest imports this module directly (the SAME source the tests
// exercise).

export type PostPushKind = 'reply' | 'new_prompt' | 'new_post';

/** Title + body for a Circle-post push. `reply` goes to the parent author; the two top-level kinds
 *  go to the circle's members (Public = new_prompt, Private = new_post). */
export function postPushCopy(
  kind: PostPushKind,
  actorName: string,
  circleName: string,
): { title: string; body: string } {
  switch (kind) {
    case 'reply':
      return { title: 'New reply', body: `${actorName} replied to your post.` };
    case 'new_prompt':
      return {
        title: 'New prompt',
        body: `${actorName} shared a new prompt in ${circleName}.`,
      };
    case 'new_post':
      return { title: 'New post', body: `${actorName} posted in ${circleName}.` };
  }
}

/** Title + body for a Private-circle join request (delivered to the owner). */
export function joinRequestCopy(
  actorName: string,
  circleName: string,
): { title: string; body: string } {
  return { title: 'New join request', body: `${actorName} asked to join ${circleName}.` };
}

/** Title + body for an approved join request (delivered to whoever asked — mandatory, no switch). */
export function joinApprovedCopy(circleName: string): { title: string; body: string } {
  return {
    title: 'Request approved',
    body: `Your request to join ${circleName} was approved.`,
  };
}

/** Title + body for someone's first reaction to your shared entry or your circle post. */
export function reactionCopy(
  target: 'entry' | 'post',
  actorName: string,
): { title: string; body: string } {
  return {
    title: 'New reaction',
    body:
      target === 'entry'
        ? `${actorName} reacted to your shared mood.`
        : `${actorName} reacted to your post.`,
  };
}

/** Title + body for a journal entry shared into a Private circle (delivered to its members). */
export function sharedEntryCopy(actorName: string): { title: string; body: string } {
  return { title: 'New shared mood', body: `${actorName} shared how they're feeling.` };
}

/** The recipient list for a fan-out: de-duplicated, minus the actor, minus anyone switched off. */
export function recipientsFor(
  memberIds: string[],
  actorId: string,
  offIds: string[] = [],
): string[] {
  const off = new Set(offIds);
  return [...new Set(memberIds)].filter((id) => id !== actorId && !off.has(id));
}

// ---------------------------------------------------------------------------------------------
// Per-circle switches (circle_notification_prefs). Every circle a person is in has its OWN set.
// No row — or no value — means ON (the default).
// ---------------------------------------------------------------------------------------------

export type CircleSwitch =
  | 'replies'
  | 'reactions'
  | 'new_prompts'
  | 'new_posts'
  | 'new_entries'
  | 'join_requests';

export type CircleSwitchRow = { circle_id: string } & Partial<
  Record<CircleSwitch, boolean | null>
>;

/** One person's switch for one circle. */
export function switchOn(
  row: CircleSwitchRow | null | undefined,
  key: CircleSwitch,
): boolean {
  return row?.[key] ?? true;
}

/**
 * One person reached through several circles (a shared entry can be in more than one): they want
 * the push if ANY of those circles still has the switch on.
 */
export function anySwitchOn(
  rows: CircleSwitchRow[],
  circleIds: string[],
  key: CircleSwitch,
): boolean {
  return circleIds.some((id) =>
    switchOn(
      rows.find((r) => r.circle_id === id),
      key,
    ),
  );
}

/**
 * Fan-out across several circles: ONE push per person, for anyone in at least one circle that still
 * has the switch on for them (minus the actor).
 */
export function recipientsAcrossCircles(
  circles: { memberIds: string[]; offIds: string[] }[],
  actorId: string,
): string[] {
  const out = new Set<string>();
  for (const c of circles) {
    for (const id of recipientsFor(c.memberIds, actorId, c.offIds)) out.add(id);
  }
  return [...out];
}
