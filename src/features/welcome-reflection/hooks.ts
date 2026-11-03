import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import * as api from './api';
import type { WelcomeReflection } from './api';

export const welcomeReflectionKeys = {
  me: (userId?: string) => ['welcome-reflection', userId] as const,
};

/** While it's being written, look again this often (the paywall and the Journal card wait on it). */
export const WELCOME_POLL_MS = 3000;

/**
 * The person's welcome reflection (null: none). Polls while it is being written, so the paywall and
 * the Journal card show it as soon as it's ready.
 */
export function useWelcomeReflection(options: { enabled?: boolean } = {}) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: welcomeReflectionKeys.me(user?.id),
    queryFn: () => api.fetchWelcomeReflection(),
    enabled: !!user?.id && options.enabled !== false,
    staleTime: 30_000,
    refetchInterval: (query) =>
      (query.state.data as WelcomeReflection | null | undefined)?.status === 'pending'
        ? WELCOME_POLL_MS
        : false,
  });
}

/**
 * Starts writing it (Skip for now, a check in with concerning words, or the paywall when it isn't
 * there yet). The answer is put straight into the cache, so a ready one shows at once.
 */
export function useRequestWelcomeReflection() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const key = welcomeReflectionKeys.me(user?.id);
  return useMutation({
    mutationFn: () => api.requestWelcomeReflection(),
    onMutate: () => {
      const now = new Date().toISOString();
      qc.setQueryData<WelcomeReflection | null>(key, (old) =>
        old?.status === 'ready' || old?.status === 'deleted'
          ? old
          : { status: 'pending', body: null, createdAt: old?.createdAt ?? now, updatedAt: now },
      );
    },
    onSuccess: (res) => {
      qc.setQueryData<WelcomeReflection | null>(key, (old) => {
        const now = new Date().toISOString();
        return {
          status: res.status,
          body: res.body,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** ••• > Delete (after the confirmation). The card goes away at once. */
export function useDeleteWelcomeReflection() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const key = welcomeReflectionKeys.me(user?.id);
  return useMutation({
    mutationFn: () => api.deleteWelcomeReflection(),
    onSuccess: () =>
      qc.setQueryData<WelcomeReflection | null>(key, (old) =>
        old ? { ...old, status: 'deleted', body: null } : old,
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * For "Skip for now" (and a check in with concerning words) on the first check in: start writing
 * the welcome reflection the moment they tap it (client p.33). Fire and forget; the paywall shows
 * its progress and offers "Try again" if it fails.
 */
export function useStartWelcomeReflection(): () => void {
  const request = useRequestWelcomeReflection();
  return () => {
    if (!request.isPending) request.mutate();
  };
}
