/**
 * The in-app notifications list (client revisions 10/14 p.8 and p.24): rows newest first, unread ones
 * tinted with a dot, a verified person's badge after their name, everything marked read once the
 * list shows it, and a tap opens what the row is about.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render } from '@testing-library/react-native';
import { NotificationsListScreen } from '@features/notifications/screens/NotificationsListScreen';

const CIRCLE = '22222222-2222-4222-8222-222222222222';
const POST = '44444444-4444-4444-8444-444444444444';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));
const mockMarkRead = jest.fn();
const mockOpen = jest.fn((_target: unknown) => Promise.resolve());
jest.mock('@features/notifications/hooks', () => ({
  useNotificationsList: () => ({
    isLoading: false,
    isError: false,
    isFetching: false,
    isRefetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    data: {
      pages: [
        {
          nextCursor: null,
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              kind: 'post_created',
              title: 'New reply',
              body: 'Auguste replied to your post.',
              data: {
                type: 'post_created',
                circle_id: '22222222-2222-4222-8222-222222222222',
                post_id: '44444444-4444-4444-8444-444444444444',
              },
              created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
              read_at: null,
              actor_name: 'Auguste',
              actor_avatar_url: null,
              actor_verified: true,
              preview: 'So good to hear from you',
            },
            {
              id: '55555555-5555-4555-8555-555555555555',
              kind: 'circle_archived',
              title: 'Circle archived',
              body: 'Konah’s Friends has been archived. You can still read it, but no new posts can be added.',
              data: {
                type: 'circle_archived',
                circle_id: '22222222-2222-4222-8222-222222222222',
              },
              created_at: '2026-09-30T12:00:00.000Z',
              read_at: '2026-09-30T13:00:00.000Z',
              actor_name: 'Konah',
              actor_avatar_url: null,
              actor_verified: false,
              preview: null,
            },
          ],
        },
      ],
    },
  }),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
}));
jest.mock('@features/notifications/openTarget', () => ({
  useOpenNotificationTarget: () => mockOpen,
}));

it('lists notifications, marks them read once shown, and opens what a row is about', async () => {
  const nav = { goBack: jest.fn() };
  const utils = await render(
    <NotificationsListScreen navigation={nav as never} route={{} as never} />,
  );

  expect(utils.getByText('Notifications')).toBeTruthy();
  // The reply: unread (dot), the verified badge right after the name, a one-line preview.
  expect(utils.getByText('So good to hear from you')).toBeTruthy();
  expect(utils.getByText('New reply · 5m')).toBeTruthy();
  expect(
    utils.getByLabelText(/^Unread\. Auguste, verified, replied to your post\./),
  ).toBeTruthy();
  expect(utils.getAllByTestId('notification-unread-dot')).toHaveLength(1);
  // The archive notice (p.24): already read, no dot.
  expect(
    utils.getByText(
      'Konah’s Friends has been archived. You can still read it, but no new posts can be added.',
    ),
  ).toBeTruthy();

  // Shown = seen: marked read once.
  expect(mockMarkRead).toHaveBeenCalledTimes(1);

  await act(async () => fireEvent.press(utils.getByLabelText(/^Unread\. Auguste/)));
  expect(mockOpen).toHaveBeenCalledWith({
    to: 'post',
    circleId: CIRCLE,
    postId: POST,
    aimAtReply: true,
  });
  await act(async () =>
    fireEvent.press(utils.getByLabelText(/^Konah’s Friends has been archived/)),
  );
  expect(mockOpen).toHaveBeenLastCalledWith({ to: 'circle', circleId: CIRCLE });

  fireEvent.press(utils.getByLabelText('Go back'));
  expect(nav.goBack).toHaveBeenCalled();
});
