import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { logger } from '@lib';
import type { NotificationPrefs } from '@app-types/database';
import { registerForPush } from './push';
import * as api from './api';
import * as listApi from './listApi';
import { notifListKeys } from './listModel';

/**
 * Register this device's push token for a user. PASSIVE-SAFE: registerForPush() only
 * mints a token when notification permission is already granted, so this is a no-op
 * (and never prompts) until the user opts in on the onboarding NotificationsStep.
 */
async function registerPushToken(userId: string): Promise<boolean> {
  try {
    const res = await registerForPush();
    if (!res) return false;
    await api.registerDeviceToken(userId, res.platform, res.token);
    return true;
  } catch (e) {
    logger.warn('push registration skipped', { error: String(e) });
    return false;
  }
}

/**
 * Registers this device's push token once the user is signed in — passively (see above). Until
 * that works (permission not granted yet), it tries again each time the app returns to the
 * foreground, so notifications allowed later, in the app or in the phone's Settings, start
 * reaching this phone right away instead of after a relaunch.
 */
export function usePushRegistration(): void {
  const user = useCurrentUser();
  const userId = user?.id;
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const attempt = () => {
      if (registeredFor.current === userId) return;
      void registerPushToken(userId).then((ok) => {
        if (ok) registeredFor.current = userId;
      });
    };
    attempt();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => subscription.remove();
  }, [userId]);
}

/**
 * Imperative token registration for the moment the user grants notification permission
 * (the onboarding NotificationsStep). Lets remote push work right away instead of only
 * from the next launch. No-ops when there's no user or permission still isn't granted.
 */
export function useRegisterPushToken(): () => void {
  const user = useCurrentUser();
  return useCallback(() => {
    if (!user) return;
    void registerPushToken(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}

export const notifKeys = {
  prefs: (uid?: string) => ['notif', 'prefs', uid] as const,
};

export function useNotificationPrefs() {
  const u = useCurrentUser();
  return useQuery({
    queryKey: notifKeys.prefs(u?.id),
    queryFn: () => api.fetchPrefs(u!.id),
    enabled: !!u?.id,
  });
}

export function useUpdateNotificationPrefs() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: api.PrefsPatch) => api.updatePrefs(u!.id, patch),
    onMutate: (patch) => {
      qc.setQueryData<NotificationPrefs | null>(notifKeys.prefs(u?.id), (old) =>
        old ? { ...old, ...patch } : old,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: notifKeys.prefs(u?.id) }),
  });
}

// ---------------------------------------------------------------------------------------------
// The in-app notifications list (client 10/14 p.8, p.24): the bell on the Journal tab.
// ---------------------------------------------------------------------------------------------

export { notifListKeys, NOTIFICATIONS_LIST_ROOT } from './listModel';

/** The caller's notifications, newest first, a page at a time. */
export function useNotificationsList() {
  const u = useCurrentUser();
  return useInfiniteQuery({
    queryKey: notifListKeys.items(u?.id),
    queryFn: ({ pageParam }) => listApi.fetchNotificationsPage(pageParam),
    initialPageParam: null as listApi.NotificationsCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!u?.id,
    staleTime: 0,
  });
}

/**
 * Whether anything is unread (the bell's dot). Checked again whenever the app comes back to the
 * foreground; a notification arriving while the app is open refreshes it too (InAppBannerHost).
 */
export function useHasUnreadNotifications() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  const uid = u?.id;
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void qc.invalidateQueries({ queryKey: notifListKeys.unread(uid) });
    });
    return () => sub.remove();
  }, [uid, qc]);
  return useQuery({
    queryKey: notifListKeys.unread(uid),
    queryFn: listApi.hasUnreadNotifications,
    enabled: !!uid,
    staleTime: 30_000,
  });
}

/** Marks everything read (opening the list); the dot goes at once. */
export function useMarkNotificationsRead() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: listApi.markNotificationsRead,
    onSuccess: () => qc.setQueryData(notifListKeys.unread(u?.id), false),
  });
}
