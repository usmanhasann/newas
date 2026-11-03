/**
 * Notification emission from the mutation hooks. useCreatePost fires a `post_created` event
 * (send-push resolves recipients from the ids); useJoinByCode fires `join_request` ONLY when the join
 * is pending ('requested'), never for an immediate ('approved') public join; useToggleHeart fires
 * `post_reaction` when hearting, never when un-hearting (send-push itself only ever sends a person's
 * FIRST heart). postsApi/circles api are mocked so we assert the emit, not the DB.
 */
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatePost, useToggleHeart } from '@features/circles/postsHooks';
import { useJoinByCode } from '@features/circles/hooks';

const mockNotify = jest.fn();
jest.mock('@features/notifications', () => ({ notifyEvent: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));

const mockCreatePost = jest.fn();
const mockSetHeart = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@features/circles/postsApi', () => ({
  createPost: (...a: unknown[]) => mockCreatePost(...a),
  setHeart: (...a: unknown[]) => mockSetHeart(...a),
}));

const mockJoinByCode = jest.fn();
const mockNotifyCircle = jest.fn();
jest.mock('@features/circles/api', () => ({
  joinByCode: (...a: unknown[]) => mockJoinByCode(...a),
  notifyCircleEvent: (...a: unknown[]) => mockNotifyCircle(...a),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockNotify.mockReset();
  mockCreatePost.mockReset();
  mockJoinByCode.mockReset();
  mockNotifyCircle.mockReset();
  mockSetHeart.mockClear();
});

describe('useCreatePost — post_created fan-out', () => {
  it('emits post_created with the created post’s circle + id', async () => {
    mockCreatePost.mockResolvedValue({ id: 'p9', circle_id: 'c1', parent_id: null });
    const { result } = await renderHook(() => useCreatePost('c1'), { wrapper });
    await result.current.mutateAsync({ parentId: null, body: 'hi' });
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({ type: 'post_created', circle_id: 'c1', post_id: 'p9' }),
    );
  });
});

describe('useJoinByCode — join_request fan-out', () => {
  it('emits join_request when the join is pending (private)', async () => {
    mockJoinByCode.mockResolvedValue({ circleId: 'c2', status: 'requested', name: 'Inner' });
    const { result } = await renderHook(() => useJoinByCode(), { wrapper });
    await result.current.mutateAsync('CODE');
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({ type: 'join_request', circle_id: 'c2' }),
    );
    // A request isn't a join yet: no "new members" notice.
    expect(mockNotifyCircle).not.toHaveBeenCalled();
  });

  it('does NOT emit join_request for an approved (public) join', async () => {
    mockJoinByCode.mockResolvedValue({ circleId: 'c3', status: 'approved', name: 'Pub' });
    const { result } = await renderHook(() => useJoinByCode(), { wrapper });
    await result.current.mutateAsync('CODE2');
    await waitFor(() => expect(mockJoinByCode).toHaveBeenCalled());
    expect(mockNotify).not.toHaveBeenCalled();
    // ...it tells the Public circle's owner instead (client revisions 10/14 p.9).
    expect(mockNotifyCircle).toHaveBeenCalledWith({ type: 'member_joined', circle_id: 'c3' });
  });
});

describe('useToggleHeart — post_reaction fan-out', () => {
  it('emits post_reaction when hearting a post', async () => {
    const { result } = await renderHook(() => useToggleHeart(), { wrapper });
    await result.current.mutateAsync({ postId: 'p1', on: true });
    expect(mockSetHeart).toHaveBeenCalledWith('p1', 'u1', true);
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({ type: 'post_reaction', post_id: 'p1' }),
    );
  });

  it('does NOT emit when un-hearting', async () => {
    const { result } = await renderHook(() => useToggleHeart(), { wrapper });
    await result.current.mutateAsync({ postId: 'p1', on: false });
    await waitFor(() => expect(mockSetHeart).toHaveBeenCalledWith('p1', 'u1', false));
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
