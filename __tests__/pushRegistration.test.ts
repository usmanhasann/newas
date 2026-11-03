/**
 * Locks the client's #1 onboarding requirement: the OS notification permission dialog
 * must NEVER appear on its own (e.g. at launch, on the anonymous session). Push-token
 * registration is PASSIVE — it only mints a token when permission is ALREADY granted and
 * never calls requestPermissionsAsync. The single place allowed to prompt is the
 * onboarding NotificationsStep, on an explicit button tap.
 */
import { registerForPush } from '@features/notifications/push';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExpoToken[xyz]' })),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
}));

const mockNotif = jest.requireMock('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
};

describe('registerForPush — passive, never prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT request permission (and returns null) when permission is not yet granted', async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ granted: false });

    const res = await registerForPush();

    expect(res).toBeNull();
    expect(mockNotif.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotif.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('mints a token WITHOUT prompting when permission is already granted', async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ granted: true });

    const res = await registerForPush();

    expect(res).toEqual({ platform: expect.any(String), token: 'ExpoToken[xyz]' });
    expect(mockNotif.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotif.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });
});
