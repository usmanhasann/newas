import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme';
import type { ProfileStackParamList } from './types';
import {
  ProfileScreen,
  EditProfileScreen,
  ReflectionToneScreen,
  DeleteAccountScreen,
} from '@features/profile';
import { NotificationsScreen } from '@features/notifications';
import { WidgetSettingsScreen } from '@features/widget';
import { HelpScreen, FeedbackScreen } from '@features/help';
import {
  SignInSecurityScreen,
  ChangeEmailScreen,
  ChangePasswordScreen,
  SetPasswordScreen,
} from '@features/security';
import { ForgotPasswordScreen } from '@features/auth';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ReflectionTone" component={ReflectionToneScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="WidgetSettings" component={WidgetSettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      {/* Sign-in & Security (client 10/14 p.17-21) and its "Forgot your current password?" */}
      <Stack.Screen name="SignInSecurity" component={SignInSecurityScreen} />
      <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
