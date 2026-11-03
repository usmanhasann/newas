import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import * as api from './api';

export const securityKeys = {
  methods: (uid?: string) => ['sign-in-methods', uid] as const,
};

/** The signed-in account's email, password yes/no and sign-in providers (fresh on every visit). */
export function useSignInMethods() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: securityKeys.methods(user?.id),
    queryFn: api.fetchSignInMethods,
    enabled: !!user?.id,
    staleTime: 0,
  });
}
