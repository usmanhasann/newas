/**
 * Typed navigation params. Registering RootParamList globally gives useNavigation()
 * full type-safety across the app.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { MoodKey } from '@theme';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: { inviteCode?: string } | undefined;
  ForgotPassword: undefined;
};

/** Pre-auth flow shown to not-yet-onboarded users: onboarding (Welcome is its step 1) with a
 *  Sign-In screen the Welcome screen can branch to for existing users. */
export type OnboardingFlowStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  /** `email`: filled in for the person (e.g. sign-up found an account with that email). */
  EmailSignIn: { email?: string } | undefined;
  ForgotPassword: { email?: string } | undefined;
  /** Account linking (client revisions 10/14 p.15-16): works on the pending link in memory. */
  LinkAccount: undefined;
};

export type JournalStackParamList = {
  JournalHome: undefined;
  AllEntries: undefined;
  NewEntry: { entryId?: string; presetMood?: MoodKey } | undefined;
  EntryDetail: { entryId: string };
  /** The in-app notifications list, from the bell at the top right (client 10/14 p.8, p.24). */
  NotificationsList: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  /** Reflection Tone (client revisions 10/14 p.21): its own row, right below Edit Profile. */
  ReflectionTone: undefined;
  Notifications: undefined;
  WidgetSettings: undefined;
  Help: undefined;
  Feedback: undefined;
  DeleteAccount: undefined;
  /** Sign-in & Security (client revisions 10/14 p.17): the Email and Password rows. */
  SignInSecurity: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  SetPassword: undefined;
  /** "Forgot your current password?": the same code reset as the sign-in page, for this email. */
  ForgotPassword: { email?: string } | undefined;
};

export type CirclesStackParamList = {
  MyCircles: undefined;
  CreateCircle: undefined;
  /** `tab`: open on that tab (a "new members" notification opens Members). Default: Feed. */
  CircleDetail: { circleId: string; tab?: 'feed' | 'members' };
  /** One circle's own notification switches (the bell on the circle's page). */
  CircleNotifications: { circleId: string };
  EditCircle: { circleId: string };
  Invite: { circleId: string };
  /** Join a circle you're not in: invite-code card + the most popular public circles. */
  JoinCircle: undefined;
  /** Circle-join email gate — carries the pending invite `code` so the join resumes on verify. */
  VerifyEmailToJoin: { code: string };
  /** `circleId` = the circle it's opened from; selects that circle's toned AI copy. */
  CircleFeed: { circleId: string };
  /** A Circle post's reply thread (opened from the Posts tab). */
  /** `replyToId`: open with the composer already answering that reply (Reply on a reply in a feed). */
  PostThread: { circleId: string; postId: string; replyToId?: string };
  /** The full list of Public Circles to browse & open-join (from Join a Circle's arrow). */
  Discover: undefined;
};

export type MainTabParamList = {
  JournalTab: NavigatorScreenParams<JournalStackParamList> | undefined;
  /**
   * A reflection notification opens Insights on that reflection: `period` = the Week / Month / Year
   * view, `periodStart` (YYYY-MM-DD) = the exact period it announced (client 10/14 p.9).
   */
  InsightsTab: { period?: 'week' | 'month' | 'year'; periodStart?: string } | undefined;
  CirclesTab: NavigatorScreenParams<CirclesStackParamList> | undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Onboarding: undefined;
  EmailConfirmation: undefined;
  Paywall: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
