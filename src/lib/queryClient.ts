/**
 * TanStack Query client. staleTime/gcTime tuned for a mobile app with mostly
 * user-owned data; per-resource overrides live in each feature's hooks
 * (build prompt §5.8). Retries use exponential backoff for cold-path resilience.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s default; lists/feeds override as needed
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
