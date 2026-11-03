/**
 * Native Google dialog → Google's id token (dynamic import so unconfigured builds never load it).
 * `fresh`: forget the phone's last Google choice first, so the dialog shows and the token is new
 * (a re-authentication must be recent). Its own module so the sign-in flows can be tested without
 * the native module.
 */
import { env } from '@lib';

export async function googleNativeIdToken(fresh = false): Promise<string> {
  const { GoogleSignin, isSuccessResponse } =
    await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId || undefined,
  });
  await GoogleSignin.hasPlayServices();
  if (fresh) await GoogleSignin.signOut().catch(() => undefined);
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new Error('Google sign-in was canceled');
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google did not return an id token');
  return idToken;
}
