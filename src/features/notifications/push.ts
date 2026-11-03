import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { DevicePlatform } from '@app-types/database';

/**
 * While the app is open the phone shows NO notification of its own, whatever it's for (client
 * revisions 10/14 p.7): no system banner, no entry in the notification list, no sound. The app shows
 * its own in-app banner instead (InAppBannerHost). Push notifications only appear when the app is
 * closed or in the background, where the phone shows them as usual (this handler isn't asked then).
 */
export const OPEN_APP_NOTIFICATION_BEHAVIOR: Notifications.NotificationBehavior = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

Notifications.setNotificationHandler({
  handleNotification: async () => OPEN_APP_NOTIFICATION_BEHAVIOR,
});

function easProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId;
}

/**
 * Mint an EXPO push token for this device — PASSIVELY. This NEVER shows the OS permission
 * prompt: it returns a token only when notification permission has ALREADY been granted,
 * otherwise null. The only place allowed to ask the user for permission is the onboarding
 * pre-permission screen (NotificationsStep), which explains the value first and prompts on
 * an explicit tap. Prompting here would surface a cold native dialog the moment the app
 * boots on the anonymous session — exactly what the client asked us to remove.
 *
 * Delivery goes through Expo's push service, which relays to FCM (Android) + APNs (iOS) —
 * so NO FCM/APNs keys live on our server. Android still needs an FCM service account
 * uploaded to EAS; iOS APNs is managed by EAS. Returns null on simulators / when
 * permission isn't granted yet.
 */
export async function registerForPush(): Promise<{
  platform: DevicePlatform;
  token: string;
} | null> {
  if (!Device.isDevice) return null;

  // Passive: do not request. If permission hasn't been granted, there's nothing to do.
  const existing = await Notifications.getPermissionsAsync();
  if (!existing.granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = easProjectId();
  const result = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  // We store the platform for reference; sending no longer branches on it.
  return { platform: Platform.OS as DevicePlatform, token: result.data };
}
