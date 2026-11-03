import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// Deep links. Sign-in redirects are handled imperatively (see auth/deepLink); password reset is a
// 6-digit code typed into the app, not a link (client revisions 10/14 p.20).
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'innercircle://',
    'innercircle-dev://',
    'innercircle-staging://',
  ],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          SignUp: 'signup',
          ForgotPassword: 'forgot-password',
        },
      },
      Main: {
        screens: {
          JournalTab: 'journal',
          InsightsTab: 'insights',
          CirclesTab: 'circles',
          ProfileTab: 'profile',
        },
      },
    },
  },
};
