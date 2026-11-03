/**
 * Live circles (N1): the Realtime channel for one circle. It's PRIVATE (only the circle's members
 * may join, checked by RLS on realtime.messages), on the circle's own topic, listens only to "post"
 * signals, ignores malformed ones, needs a signed-in session, and leaves cleanly. Supabase mocked.
 */
import { openCirclePostsChannel } from '@features/circles/liveApi';

type BroadcastCb = (m: { payload: unknown }) => void;
type StatusCb = (s: string) => void;
const mockState: {
  session: { access_token: string } | null;
  topic?: string;
  config?: unknown;
  filter?: unknown;
  onBroadcast?: BroadcastCb;
  onStatus?: StatusCb;
  removed: number;
} = { session: { access_token: 't' }, removed: 0 };
const mockChannel = {
  on: (_type: string, filter: unknown, cb: BroadcastCb) => {
    mockState.filter = filter;
    mockState.onBroadcast = cb;
    return mockChannel;
  },
  subscribe: (cb: StatusCb) => {
    mockState.onStatus = cb;
    return mockChannel;
  },
};
const mockSetAuth = jest.fn(() => Promise.resolve());
jest.mock('@lib', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: mockState.session } }) },
    realtime: { setAuth: () => mockSetAuth() },
    channel: (topic: string, params: unknown) => {
      mockState.topic = topic;
      mockState.config = params;
      return mockChannel;
    },
    removeChannel: () => {
      mockState.removed += 1;
      return Promise.resolve('ok');
    },
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));
const ID = '00000000-0000-4000-8000-000000000001';

it('listens to the circle’s private topic, passes on valid signals, and leaves cleanly', async () => {
  const onSignal = jest.fn();
  const onStatus = jest.fn();
  const stop = openCirclePostsChannel('c1', { onSignal, onStatus });
  await flush();

  expect(mockSetAuth).toHaveBeenCalled();
  expect(mockState.topic).toBe('circle-posts:c1');
  expect(mockState.config).toEqual({ config: { private: true } });
  expect(mockState.filter).toEqual({ event: 'post' });

  const valid = { op: 'insert', post_id: ID, parent_id: null, like_count: 0, reply_count: 0, edited: false };
  mockState.onBroadcast!({ payload: { ...valid, id: 'message-id' } });
  expect(onSignal).toHaveBeenCalledWith(valid);
  mockState.onBroadcast!({ payload: { op: 'insert', post_id: 'x' } });
  mockState.onBroadcast!({ payload: null });
  expect(onSignal).toHaveBeenCalledTimes(1);

  mockState.onStatus!('SUBSCRIBED');
  mockState.onStatus!('CHANNEL_ERROR');
  mockState.onStatus!('CLOSED');
  expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['live', 'down', 'down']);

  await stop();
  expect(mockState.removed).toBe(1);
});

it('opens nothing without a signed-in session, or when stopped first', async () => {
  mockState.topic = undefined;
  mockState.session = null;
  const noSession = openCirclePostsChannel('c2', { onSignal: jest.fn(), onStatus: jest.fn() });
  await flush();
  expect(mockState.topic).toBeUndefined();
  await noSession();

  mockState.session = { access_token: 't' };
  const early = openCirclePostsChannel('c3', { onSignal: jest.fn(), onStatus: jest.fn() });
  await early();
  await flush();
  expect(mockState.topic).toBeUndefined();
  expect(mockState.removed).toBe(1);
});
