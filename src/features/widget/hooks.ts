import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser, useSessionStore } from '@store/session';
import { registerSignOutTask } from '@store/signOutTasks';
import { toast } from '@store/toast';
import { getWidgetCircleId, setWidgetCircleId } from './api';
import { forgetWidgetOnSignOut, reconcileWidgetOwner, refreshWidget } from './sync';

export function useWidgetCircle() {
  return useQuery({ queryKey: ['widget', 'circle'], queryFn: getWidgetCircleId });
}

/** Save the picked circle (or none) and update the widget, saying so when it couldn't be updated. */
export function useSetWidgetCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | null) => {
      await setWidgetCircleId(id);
      return refreshWidget();
    },
    onSuccess: (result) => {
      if (result === 'failed') toast.info('Saved. Your widget will update once you’re online.');
      if (result === 'unavailable') toast.error('That circle can’t be shown on the widget anymore.');
    },
    onError: () => toast.error('We couldn’t save your widget choice. Please try again.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['widget', 'circle'] }),
  });
}

/**
 * Mounted once at the app root. Waits until the session has settled (cold-launch restore done, no
 * sign-out swap in progress), then ties the widget to the signed-in account: signing out or switching
 * accounts wipes it (and signing out revokes its key), the same account re-syncs. Also re-syncs
 * whenever the app comes back to the foreground (Android draws from what the app writes; iOS gets
 * fresh settings + a reload).
 */
export function useWidgetSync(): void {
  const user = useCurrentUser();
  const bootstrapped = useSessionStore((s) => s.bootstrapped);
  const reauthenticating = useSessionStore((s) => s.reauthenticating);
  const qc = useQueryClient();
  const userId = user && !user.is_anonymous ? user.id : null;

  useEffect(() => {
    if (!bootstrapped || reauthenticating) return;
    void reconcileWidgetOwner(userId).then(() =>
      qc.invalidateQueries({ queryKey: ['widget', 'circle'] }),
    );
  }, [bootstrapped, reauthenticating, userId, qc]);

  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWidget();
    });
    return () => subscription.remove();
  }, [userId]);

  // Signing out revokes this phone's widget key while the session can still do it.
  useEffect(() => registerSignOutTask(forgetWidgetOnSignOut), []);
}
