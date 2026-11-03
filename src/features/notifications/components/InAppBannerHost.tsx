/**
 * In-app notifications, mounted once at the app root inside the NavigationContainer (client
 * revisions 10/14 p.7 to 9):
 *
 *  - While the app is open the phone shows nothing (push.ts); every notification that arrives, from
 *    the server or a reminder scheduled on the phone, shows here as an in-app banner instead.
 *    The server only sends what the user's switches allow (the Notifications page and each circle's
 *    bell), so banners follow the same settings.
 *  - No banner in onboarding, on a paywall, on the sign-in / sign-up screens (anything outside the
 *    app's main screens), or while the crisis resources pop-up holds them (@store/bannerHold).
 *  - No banner for a post, reply or heart in the circle the user is looking at: it appears live.
 *  - Tapping a banner, or a push notification from outside the app, opens what it is about.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  NavigationContainerRefContext,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { FullWindowOverlay } from 'react-native-screens';
import { bannersHeld, useBannerHoldStore } from '@store/bannerHold';
import { logger, queryClient } from '@lib';
import type { RootStackParamList } from '@/navigation/types';
import { fetchBannerPost, fetchPostParent } from '../api';
import { useBannerStore } from '../bannerStore';
import { NOTIFICATIONS_LIST_ROOT } from '../listModel';
import {
  bannersAllowedOn,
  isViewingCircle,
  liveActivityCircle,
  notificationBanner,
  planNavigation,
  postBanner,
  resolveTarget,
  targetForTopic,
  topicFor,
  type BannerItem,
  type NavTarget,
} from '../inAppModel';
import { InAppBanner } from './InAppBanner';

type RootNav = NavigationContainerRef<RootStackParamList>;

function rootRouteName(nav: RootNav | undefined): string | undefined {
  if (!nav?.isReady()) return undefined;
  const state = nav.getRootState();
  return state?.routes[state.index]?.name;
}

export function InAppBannerHost() {
  const nav = useContext(NavigationContainerRefContext) as RootNav | undefined;
  const current = useBannerStore((s) => s.current);
  const held = useBannerHoldStore((s) => s.holds > 0);
  const [inApp, setInApp] = useState(() => bannersAllowedOn(rootRouteName(nav)));
  const pendingTap = useRef<NavTarget | null>(null);

  // Where the user is: banners only inside the app's main screens.
  useEffect(() => {
    if (!nav) return;
    const update = () => setInApp(bannersAllowedOn(rootRouteName(nav)));
    update();
    return nav.addListener('state', update);
  }, [nav]);

  const canShow = useCallback(
    () => !bannersHeld() && bannersAllowedOn(rootRouteName(nav)),
    [nav],
  );
  const viewing = useCallback(
    (circleId: string) => isViewingCircle(nav?.getCurrentRoute(), circleId),
    [nav],
  );

  // Leaving the main screens, or the crisis pop-up opening: nothing up, nothing waiting.
  useEffect(() => {
    if (held || !inApp) useBannerStore.getState().clear();
  }, [held, inApp]);

  const open = useCallback(
    async (target: NavTarget) => {
      if (!nav) return;
      const resolved = await resolveTarget(target, fetchPostParent);
      if (!bannersAllowedOn(rootRouteName(nav))) return;
      nav.navigate('Main', planNavigation(resolved));
    },
    [nav],
  );

  // Every notification that arrives while the app is open.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      // It's in the notifications list now (the server saved it): the bell's dot and the list
      // catch up, banner or not.
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_ROOT });
      void (async () => {
        if (!canShow()) return;
        const { identifier, content } = n.request;
        const topic = topicFor(content.data, identifier);
        const liveIn = liveActivityCircle(topic);
        if (liveIn && viewing(liveIn)) return;

        let item: BannerItem | null = null;
        if (topic.kind === 'post') {
          // The banner names who posted, where, and what they wrote: read from the post itself.
          const post = await fetchBannerPost(topic.postId).catch((e: unknown) => {
            logger.warn('in-app banner post lookup failed', { error: String(e) });
            return undefined;
          });
          if (post === null) return; // deleted before it could show
          if (post) item = postBanner(identifier, post);
          // The wait may have changed things: check again.
          if (!canShow() || (liveIn && viewing(liveIn))) return;
        }
        useBannerStore
          .getState()
          .receive(
            item ??
              notificationBanner(
                identifier,
                topic,
                content.title,
                content.body,
                content.data,
              ),
          );
      })();
    });
    return () => sub.remove();
  }, [canShow, viewing]);

  // A push notification tapped from outside the app (it opened or woke the app). Opened once the
  // user is in the app's main screens.
  const flushTap = useCallback(() => {
    const target = pendingTap.current;
    if (!target || !bannersAllowedOn(rootRouteName(nav))) return;
    pendingTap.current = null;
    Notifications.clearLastNotificationResponse();
    void open(target);
  }, [nav, open]);

  useEffect(() => {
    const seen = new Set<string>();
    const onTap = (r: Notifications.NotificationResponse) => {
      if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const { identifier, content } = r.notification.request;
      if (seen.has(identifier)) return;
      seen.add(identifier);
      pendingTap.current = targetForTopic(topicFor(content.data, identifier));
      flushTap();
    };
    const launched = Notifications.getLastNotificationResponse();
    if (launched) onTap(launched);
    const sub = Notifications.addNotificationResponseReceivedListener(onTap);
    return () => sub.remove();
  }, [flushTap]);

  useEffect(() => {
    if (inApp) flushTap();
  }, [inApp, flushTap]);

  const gone = useCallback(() => {
    useBannerStore.getState().next((item) => {
      const liveIn =
        item.posts.length > 0 || item.target?.to === 'post' ? item.circleId : null;
      return !(liveIn && viewing(liveIn));
    });
  }, [viewing]);

  if (!current || held || !inApp) return null;

  const banner = (
    <InAppBanner
      key={current.key}
      item={current}
      onPress={() => {
        if (current.target) void open(current.target);
      }}
      onGone={gone}
    />
  );
  // iOS: above everything, including a screen presented as a modal (writing an entry); touches
  // outside the banner pass through to the app.
  return Platform.OS === 'ios' ? <FullWindowOverlay>{banner}</FullWindowOverlay> : banner;
}
