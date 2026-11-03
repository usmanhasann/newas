/**
 * Picking a circle for the widget always says what happened when it didn't simply work (audit
 * 2026-09-30: it used to fail silently): offline → the choice is saved and the widget updates once
 * online; a circle that can't be shown any more → said plainly. A normal pick shows nothing extra.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSetWidgetCircle } from '@features/widget/hooks';

const mockInfo = jest.fn();
const mockError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { info: (m: string) => mockInfo(m), error: (m: string) => mockError(m), success: jest.fn() },
}));
const mockSetCircle = jest.fn((_id: string | null) => Promise.resolve());
jest.mock('@features/widget/api', () => ({
  getWidgetCircleId: jest.fn(() => Promise.resolve(null)),
  setWidgetCircleId: (id: string | null) => mockSetCircle(id),
}));
const mockRefresh = jest.fn();
jest.mock('@features/widget/sync', () => ({
  refreshWidget: () => mockRefresh(),
  reconcileWidgetOwner: jest.fn(),
  forgetWidgetOnSignOut: jest.fn(),
}));

it('says so when the widget could not be updated, and stays quiet when it could', async () => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useSetWidgetCircle(), { wrapper });

  mockRefresh.mockResolvedValueOnce('synced');
  await act(async () => {
    await result.current.mutateAsync('c1');
  });
  expect(mockSetCircle).toHaveBeenLastCalledWith('c1');
  expect(mockInfo).not.toHaveBeenCalled();
  expect(mockError).not.toHaveBeenCalled();

  mockRefresh.mockResolvedValueOnce('failed');
  await act(async () => {
    await result.current.mutateAsync('c2');
  });
  expect(mockInfo).toHaveBeenCalledWith('Saved. Your widget will update once you’re online.');

  mockRefresh.mockResolvedValueOnce('unavailable');
  await act(async () => {
    await result.current.mutateAsync('c3');
  });
  expect(mockError).toHaveBeenCalledWith('That circle can’t be shown on the widget anymore.');

  mockSetCircle.mockRejectedValueOnce(new Error('storage'));
  await act(async () => {
    await result.current.mutateAsync('c4').catch(() => undefined);
  });
  expect(mockError).toHaveBeenLastCalledWith('We couldn’t save your widget choice. Please try again.');
});
