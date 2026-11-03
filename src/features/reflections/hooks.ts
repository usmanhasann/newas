import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { useProfile } from '@features/profile';
import { localDateInTZ } from '@utils/date';
import * as api from './api';

export const reflectionKeys = {
  all: ['reflections'] as const,
  overview: (uid?: string, today?: string) =>
    ['reflections', 'overview', uid, today] as const,
};

/** `todayLocal` (the user's local date) comes from a screen that tracks day changes itself. */
export function useReflectionsOverview(todayLocal?: string) {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const today = todayLocal ?? localDateInTZ(new Date(), profile?.timezone);
  return useQuery({
    queryKey: reflectionKeys.overview(user?.id, today),
    queryFn: () => api.fetchReflectionsOverview(today),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

/** Fire-and-refresh: trigger idempotent server generation, then refetch overview. */
export function useGenerateReflections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerReflectionGeneration(),
    onSettled: () => qc.invalidateQueries({ queryKey: reflectionKeys.all }),
  });
}
