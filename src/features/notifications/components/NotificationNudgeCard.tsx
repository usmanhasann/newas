/**
 * The notification re-prompt (client rule). Shown on Home to users who are clearly engaged —
 * 5+ entries across 3+ separate local days — but who can't currently receive notifications.
 *
 * WHY IT ISN'T THE SYSTEM PROMPT: iOS shows its permission alert exactly once, ever. After a
 * user taps "Don't Allow" no app can bring it back, so on iOS this card IS the prompt, and its
 * CTA deep-links to the app's page in system Settings. On Android (and on iOS before the first
 * ask) the OS still permits asking, so the same CTA raises the real system prompt instead —
 * requestNotificationPermission() handles that difference for us.
 *
 * FREQUENCY: once per app session. Deciding to show marks the session immediately, so leaving
 * Home and coming back won't re-raise it; a fresh launch will. See @store/notificationNudge.
 *
 * SHAPE: split in two on purpose. The outer component asks the OS (cheap, local, no network)
 * and only mounts the inner one when notifications are actually blocked — so the journal-stats
 * query is never issued for the majority of users, who have nothing to be nudged about. Home is
 * the app's most-visited screen; it shouldn't pay for a query it can't use.
 */
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@components';
import { colors } from '@theme';
import { useJournalStats } from '@features/insights';
import { useNotificationNudgeStore } from '@store/notificationNudge';
import { useUpdateNotificationPrefs } from '../hooks';
import {
  canDeliver,
  getNotificationPermission,
  requestNotificationPermission,
} from '../reminders';
import { meetsRepromptEngagement } from '../nudge';
import { trackNotification } from '../analytics';

export function NotificationNudgeCard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // The CURRENT permission, not the value stored at onboarding — they may have changed
      // it in system Settings since, in which case there is nothing to nudge about.
      const perm = await getNotificationPermission();
      if (alive) setBlocked(!canDeliver(perm));
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!blocked) return null;
  return <EngagedNudge />;
}

/** Only mounted when notifications are blocked, so the stats query is scoped to who needs it. */
function EngagedNudge() {
  const { data: stats } = useJournalStats();
  const update = useUpdateNotificationPrefs();
  const shownThisSession = useNotificationNudgeStore((s) => s.shownThisSession);
  const visible = useNotificationNudgeStore((s) => s.visible);
  const raise = useNotificationNudgeStore((s) => s.raise);
  const hide = useNotificationNudgeStore((s) => s.hide);

  useEffect(() => {
    // `shownThisSession` is the guard: raised at most once per launch, however often Home
    // mounts. Visibility is session state, so this sets no component state.
    if (shownThisSession || !meetsRepromptEngagement(stats)) return;
    raise();
    trackNotification('reprompt_shown', {
      entries: stats?.entries_count ?? 0,
      days: stats?.distinct_days ?? 0,
    });
  }, [stats, shownThisSession, raise]);

  if (!visible) return null;

  const onEnable = async () => {
    hide();
    trackNotification('reprompt_accepted');
    // They asked for reminders — record that regardless of what the OS says, so a permission
    // granted later (in Settings) results in a scheduled reminder without a second trip here.
    update.mutate({ journaling_reminder: true });
    const perm = await requestNotificationPermission();
    if (canDeliver(perm)) {
      trackNotification('reprompt_permission_granted');
      return;
    }
    trackNotification('reprompt_sent_to_settings');
    await Linking.openSettings();
  };

  const onDismiss = () => {
    hide();
    trackNotification('reprompt_dismissed');
  };

  return (
    <Card className="mt-4 bg-brand-50">
      <View className="flex-row items-start gap-3">
        <Ionicons name="notifications-outline" size={22} color={colors.brand[500]} />
        <View className="flex-1">
          <Text variant="bodyStrong">Keep the habit going?</Text>
          <Text variant="bodyMuted" className="mt-1">
            You’ve been checking in regularly. A gentle daily nudge makes it easier to
            keep it up.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Button
              title="Turn on reminders"
              size="sm"
              fullWidth={false}
              onPress={() => void onEnable()}
            />
            <Button
              title="Not now"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={onDismiss}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}
