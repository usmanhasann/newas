import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { logger } from '@lib';
import type { Profile } from '@app-types/database';
import * as api from './api';
import { phoneTimeZone, timezoneToSave } from './timezone';

export const profileKeys = {
  me: (userId?: string) => ['profile', userId] as const,
};

export function useProfile() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: profileKeys.me(user?.id),
    queryFn: () => api.fetchMyProfile(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useCompleteOnboarding() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.completeOnboarding(user!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKeys.me(user?.id) }),
  });
}

export function useUpdateProfile() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: api.ProfilePatch) => api.updateMyProfile(user!.id, patch),
    onSuccess: (updated) => qc.setQueryData(profileKeys.me(user?.id), updated),
  });
}

/**
 * The app follows the phone's time zone (client 10/14 p.30; the manual Timezone setting is gone).
 * Every "day" in the app (each entry's date, the streak, Today's Moods, the Mood Breakdown and
 * reflections) and the server's 8 PM streak reminder and 9 AM recaps read profiles.timezone, so it
 * is kept equal to the phone's zone: checked when the app opens and every time it comes back from
 * the background, and saved when it changed (flying from the West Coast to the East Coast switches
 * to Eastern time once the phone does).
 *
 * The cached profile takes the phone's zone at once, so every screen's "today" moves with the phone
 * without waiting for the save. A save that fails is tried again on the next return to the app.
 * Mounted once at the app root.
 */
export function useSyncProfileTimezone(): void {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  // Bumped on each return to the foreground (read the phone's zone again), and after a save when a
  // newer zone is waiting its turn (saves go one at a time, so the last zone is the one kept).
  const [tick, setTick] = useState(0);
  // `${user}|${zone}` shown in the cache but not yet confirmed by the server (retried until it is).
  const unsaved = useRef<string | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const uid = user?.id;
    if (!uid || !profile) return;
    const phone = phoneTimeZone();
    if (!phone) return;
    const key = `${uid}|${phone}`;
    if (timezoneToSave(profile.timezone, phone)) {
      qc.setQueryData<Profile | null>(profileKeys.me(uid), (p) => (p ? { ...p, timezone: phone } : p));
      unsaved.current = key;
    }
    if (unsaved.current !== key || saving.current) return;
    saving.current = true;
    api
      .saveMyTimezone(uid, phone)
      .then((saved) => {
        if (unsaved.current !== key) return; // the phone moved on mid-save: its newer zone is next
        unsaved.current = null;
        // A zone the server can't read is not stored (it keeps the last one); the app still
        // follows the phone, and doesn't ask again for the same zone.
        qc.setQueryData(profileKeys.me(uid), { ...saved, timezone: phone });
      })
      .catch((e: unknown) => {
        logger.warn('time zone save failed; tried again on the next return to the app', {
          error: String(e),
        });
      })
      .finally(() => {
        saving.current = false;
        if (unsaved.current && unsaved.current !== key) setTick((n) => n + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on sign-in, a profile zone change and each return to the app
  }, [user?.id, profile?.timezone, tick]);
}

/**
 * Put the user's name on their profile right after sign-up / sign-in (see
 * api.syncDisplayNameFromAuth). By then the provider has given whatever name it will give, so the
 * email fallback is allowed. Fire-and-forget so a missing name never blocks the user;
 * useEnsureDisplayName retries on every app start. The cache entry updated is the account the
 * server says is signed in now.
 */
export function useSyncDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => api.syncDisplayNameFromAuth(name, { allowEmailFallback: true }),
    onSuccess: (updated) => {
      if (updated) qc.setQueryData(profileKeys.me(updated.user_id), updated);
    },
    onError: () => {
      /* best-effort — never block sign-in on a name sync; retried on the next app start */
    },
  });
}

/**
 * Every signed-in account must have a name (client 10/14 p.3: "it needs to pull a name 100 percent
 * of the time"). An empty profile name is filled from what the account holds (typed / Apple /
 * Google name). Runs on every app start, after any sign-in (incl. the Sign In screen, where a new
 * user can start), and again when the account's name changes (Apple's one-time name lands a moment
 * after the sign-in itself), at most once per account + names. The email fallback is used here
 * only once onboarding is finished: before that, the sign-up step fills the name with the real
 * one, and an early fallback must never take its place. Mounted once at the app root.
 */
export function useEnsureDisplayName(): void {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const fill = useMutation({
    mutationFn: (allowEmailFallback: boolean) =>
      api.syncDisplayNameFromAuth(undefined, { allowEmailFallback }),
    onSuccess: (updated) => {
      if (updated) qc.setQueryData(profileKeys.me(updated.user_id), updated);
    },
    onError: () => {
      /* best-effort — tried again on the next app start */
    },
  });
  const tried = useRef<string | null>(null);
  const accountNames = user ? (api.accountName(user) ?? '') : '';
  const onboarded = !!profile?.onboarding_completed;

  useEffect(() => {
    if (!user?.id || user.is_anonymous || !profile || profile.display_name?.trim()) return;
    const key = `${user.id}|${accountNames}|${onboarded}`;
    if (tried.current === key) return;
    tried.current = key;
    fill.mutate(onboarded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the account, its names or the profile change
  }, [user?.id, user?.is_anonymous, accountNames, onboarded, profile?.display_name]);
}
