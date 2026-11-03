/**
 * Signing out runs the registered "last chance while signed in" tasks first (audit 2026-09-30: the
 * widget key was never revoked on sign-out), and a slow or failing task never blocks signing out.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSignOutTask, runSignOutTasks } from '@store/signOutTasks';
import { useSignOut } from '@features/auth/hooks';

const mockOrder: string[] = [];
jest.mock('@features/auth/api', () => ({
  signOut: jest.fn(() => {
    mockOrder.push('signOut');
    return Promise.resolve();
  }),
  signInAnonymously: jest.fn(() => {
    mockOrder.push('anon');
    return Promise.resolve();
  }),
}));
jest.mock('@lib', () => ({
  supabase: {},
  registerAuthAutoRefresh: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

it('runs the tasks before signing out, even when one fails', async () => {
  const stopOk = registerSignOutTask(async () => {
    mockOrder.push('revoke widget key');
  });
  const stopBad = registerSignOutTask(() => Promise.reject(new Error('offline')));

  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useSignOut(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync();
  });
  expect(mockOrder).toEqual(['revoke widget key', 'signOut', 'anon']);
  stopOk();
  stopBad();
});

it('a task that hangs is given up on after the time limit', async () => {
  const stop = registerSignOutTask(() => new Promise<void>(() => {}));
  const started = Date.now();
  await runSignOutTasks(50);
  expect(Date.now() - started).toBeLessThan(2000);
  stop();
});
