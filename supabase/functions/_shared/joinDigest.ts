// Sends one Public circle's "new members" push to its owner (client revisions 10/14, p.9). Shared by
// send-push ("member_joined", right after a join) and circle-join-digest (the every-minute sweep).
//
// claim_circle_join_digest (SQL, atomic) decides whether a push is due: at most one per circle every
// 10 minutes, everyone who joined since the last one gathered into it, people who already left not
// counted. A claimed digest is used up even when the owner's "New members" switch is off, so turning
// it back on never replays old joins.
import { sendExpoPush } from './push.ts';
import { joinNoticeCopy, joinNoticeData } from './circleNotices.ts';
import { recordNotices } from './notificationsList.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

interface JoinDigest {
  owner_id: string | null;
  circle_name: string | null;
  latest_user_id: string | null;
  joined_count: number | null;
}

/** Claims and sends this circle's digest if one is due. Returns how many devices Expo accepted. */
export async function deliverJoinDigest(admin: Admin, circleId: string): Promise<number> {
  const { data, error } = await admin.rpc('claim_circle_join_digest', { p_circle: circleId });
  if (error) return 0;
  const digest = ((data ?? []) as JoinDigest[])[0];
  if (!digest?.owner_id || !digest.latest_user_id || !digest.joined_count) return 0;

  // The owner's own "New members" switch for this circle (no saved row = on).
  const { data: prefs } = await admin
    .from('circle_notification_prefs')
    .select('new_members')
    .eq('user_id', digest.owner_id)
    .eq('circle_id', circleId)
    .maybeSingle();
  if (prefs?.new_members === false) return 0;

  const { data: joiner } = await admin
    .from('profiles')
    .select('display_name')
    .eq('user_id', digest.latest_user_id)
    .maybeSingle();
  const copy = joinNoticeCopy(
    joiner?.display_name ?? 'Someone',
    digest.joined_count,
    digest.circle_name ?? 'your circle',
  );
  // Saved to the owner's notifications list too (client 10/14 p.8), phone or no phone.
  await recordNotices(admin, [digest.owner_id], {
    kind: 'member_joined',
    ...copy,
    data: joinNoticeData(circleId),
    actorId: digest.latest_user_id,
  });

  const { data: toks } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', digest.owner_id)
    .eq('enabled', true);
  const tokens = ((toks ?? []) as { token: string }[]).map((t) => t.token);
  if (tokens.length === 0) return 0;

  const { sent, invalidTokens } = await sendExpoPush(
    tokens,
    copy.title,
    copy.body,
    joinNoticeData(circleId),
  );
  if (invalidTokens.length > 0) {
    await admin.from('device_tokens').update({ enabled: false }).in('token', invalidTokens);
  }
  return sent;
}
