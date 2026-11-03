/**
 * Client revisions 10/14 p.7: never show an iOS or Android push notification while the app is open,
 * whatever it's for. The phone asks the app's handler how to present a notification that arrives
 * while the app is open; the answer must be: no banner, not in the list, no sound, no badge (the
 * app shows its own in-app banner instead). With the app closed or in the background the handler
 * isn't asked and the phone shows the push as usual.
 */
import * as Notifications from 'expo-notifications';
import { OPEN_APP_NOTIFICATION_BEHAVIOR } from '@features/notifications/push';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));

const mockSetHandler = Notifications.setNotificationHandler as jest.Mock;

it('shows nothing from the phone for any notification while the app is open', async () => {
  expect(mockSetHandler).toHaveBeenCalledTimes(1);
  const handler = mockSetHandler.mock.calls[0][0] as {
    handleNotification: (n: unknown) => Promise<Notifications.NotificationBehavior>;
  };
  const kinds = [
    { type: 'post_created' },
    { type: 'recap', recap_type: 'weekly' },
    { type: 'streak_reminder' },
    { type: 'circle_archived' },
    {},
  ];
  for (const data of kinds) {
    const behavior = await handler.handleNotification({
      request: { identifier: 'x', content: { title: 't', body: 'b', data } },
    });
    expect(behavior).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  }
  expect(OPEN_APP_NOTIFICATION_BEHAVIOR).toEqual({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});
