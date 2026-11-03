import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import * as api from './api';

export const emailVerifyKeys = {
  status: (uid?: string) => ['email-verified', uid] as const,
};

/**
 * The COMMITTED verification flag the route gate reads. Fetched once when the user
 * loads; not auto-refetched (the confirmation screen drives its own checks and only
 * invalidates this query on "Continue to Home"), so the success screen can show before
 * the gate advances. Returning/verified users resolve to true on first load and skip
 * the flow entirely.
 */
export function useEmailVerified() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: emailVerifyKeys.status(user?.id),
    queryFn: () => api.fetchEmailVerified(user!.id),
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
