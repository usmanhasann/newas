// Who is told about an entry shared into Private circles (send-push "share_created"), and which
// circle each push is about, so tapping it (or the in-app banner) can open that circle (client
// revisions 10/14 p.8). No I/O, no imports and no Deno APIs: send-push calls this, and Jest imports
// this module directly (the SAME source the tests exercise).

/** One circle the entry was just announced in. */
export interface ShareCircle {
  circleId: string;
  /** The circle's post holding the shared entry (null if it couldn't be read). */
  postId: string | null;
  /** Members who can see it (they had joined by the time it was shared). */
  memberIds: string[];
  /** Members who switched "New shared entries" off for this circle. */
  offIds: string[];
}

/** One push: these people, about this circle's post. */
export interface SharePushGroup {
  circleId: string;
  postId: string | null;
  recipients: string[];
}

/**
 * Each person is told once, however many of the circles they share with the author: about the first
 * circle (in the order given) where they can see the entry and haven't switched these pushes off.
 * The author is never told. Everyone told is exactly who the single combined push used to reach.
 */
export function sharePushGroups(
  circles: readonly ShareCircle[],
  actorId: string,
): SharePushGroup[] {
  const told = new Set<string>([actorId]);
  const groups: SharePushGroup[] = [];
  for (const c of circles) {
    const off = new Set(c.offIds);
    const recipients: string[] = [];
    for (const id of c.memberIds) {
      if (told.has(id) || off.has(id)) continue;
      told.add(id);
      recipients.push(id);
    }
    if (recipients.length > 0) {
      groups.push({ circleId: c.circleId, postId: c.postId, recipients });
    }
  }
  return groups;
}

/**
 * What a shared-entry push carries: the entry, and the circle (and its post) it was shared in, so a
 * tap can open that circle. The type is unchanged, so app builds that read only `type` behave as
 * before.
 */
export function sharePushData(
  entryId: string,
  group: { circleId: string; postId: string | null },
): Record<string, string> {
  const data: Record<string, string> = {
    type: 'share_created',
    entry_id: entryId,
    circle_id: group.circleId,
  };
  if (group.postId) data.post_id = group.postId;
  return data;
}
