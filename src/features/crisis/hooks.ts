import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export const crisisKeys = {
  keywords: ['crisis', 'keywords'] as const,
};

/** Keywords are small + change rarely; cache aggressively so scanning is instant. */
export function useCrisisKeywords() {
  return useQuery({
    queryKey: crisisKeys.keywords,
    queryFn: api.fetchCrisisKeywords,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
}
