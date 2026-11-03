/**
 * The in-app notifications list with nothing in it: a friendly empty state, and nothing is marked.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { NotificationsListScreen } from '@features/notifications/screens/NotificationsListScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));
const mockMarkRead = jest.fn();
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
    data: { pages: [{ items: [], nextCursor: null }] },
  }),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
}));
jest.mock('@features/notifications/openTarget', () => ({
  useOpenNotificationTarget: () => jest.fn(),
}));

it('says there is nothing yet, and marks nothing', async () => {
  const utils = await render(
    <NotificationsListScreen
      navigation={{ goBack: jest.fn() } as never}
      route={{} as never}
    />,
  );
  expect(utils.getByText('No notifications yet')).toBeTruthy();
  expect(
    utils.getByText(
      'When something happens in your circles, or a reflection is ready, it shows up here.',
    ),
  ).toBeTruthy();
  expect(mockMarkRead).not.toHaveBeenCalled();
});
