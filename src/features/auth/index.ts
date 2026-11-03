/**
 * Auth feature public surface. Other features import only from here.
 */
export { LoginScreen } from './screens/LoginScreen';
export { SignUpScreen } from './screens/SignUpScreen';
export { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
export { SignInScreen } from './screens/SignInScreen';
export { EmailSignInScreen } from './screens/EmailSignInScreen';
export { LinkAccountScreen } from './screens/LinkAccountScreen';
export { useAuthBootstrap, useSignOut, useSignIn, useDeleteAccount } from './hooks';
export { useAuthDeepLink } from './deepLink';
export { signInAnonymously, linkEmailIdentity, deleteAccount } from './api';
export { existingAccountKind, socialSignInMessage } from './errors';
export {
  codeProblemMessage,
  codeSendProblemMessage,
  triesLeft,
  CODE_HINT,
  providerName,
} from './codeMessages';
export {
  emailSchema,
  passwordSchema,
  oneTimeCodeSchema,
  resetPasswordSchema,
} from './schema';
export {
  signInWithApple,
  signInWithGoogle,
  isAppleAuthAvailable,
  isUserCanceledSignIn,
  confirmAppleForDeletion,
  signInExistingWithApple,
  signInExistingWithGoogle,
  reauthenticateWithProvider,
  type ReauthProof,
} from './social';
// Account linking (client revisions 10/14 p.15-16, N4): the sign-up step opens it.
export { resolveAccountLink, startEmailAccountLink } from './linkFlow';
export { linkProblemMessage } from './linkMessages';
