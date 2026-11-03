/**
 * Auth deep links. The client uses detectSessionInUrl=false (RN), so we parse an incoming sign-in
 * redirect ourselves and establish its session: PKCE (`?code=`) or implicit (`#access_token=...`),
 * e.g. Google's in-app browser sign-in when Android closed the app meanwhile. Also reports a Google
 * sign-in refusal whose redirect reopened the app (see social.orphanGoogleRedirectError).
 * Password reset no longer uses a link: it is a 6-digit code typed into the app (client revisions
 * 10/14 p.20). A re-authentication redirect (Sign-in & Security, social.reauthenticateWithProvider)
 * is never turned into a session here.
 */
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { supabase, logger } from '@lib';
import { toast } from '@store/toast';
import { isReauthRedirect, isUserCanceledSignIn, orphanGoogleRedirectError } from './social';
import { socialSignInMessage } from './errors';

/** Establishes the session a sign-in redirect carries. True when the URL carried one. */
export async function handleAuthUrl(url: string): Promise<boolean> {
  if (isReauthRedirect(url)) return false; // a re-authentication proof, not a sign-in
  const parsed = Linking.parse(url);

  // PKCE flow: ?code=...
  const code = parsed.queryParams?.code;
  if (typeof code === 'string' && code.length > 0) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  // Implicit flow: tokens live in the URL fragment (#access_token=...).
  const fragment = url.split('#')[1];
  if (fragment) {
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      return true;
    }
  }

  return false;
}

/** Listens for incoming sign-in redirects (and Google refusals) for the whole app. */
export function useAuthDeepLink(): void {
  useEffect(() => {
    let active = true;
    const process = async (url: string | null) => {
      if (!url || !active) return;
      if (isReauthRedirect(url)) return; // the re-authentication that opened it reads it
      // A Google sign-in refusal that reopened the app after it was closed: say what happened
      // instead of a silent stop (client 10/14 p.15). Checked at once, while the in-app browser
      // sign-in (when it is still running) would report it itself.
      const refused = orphanGoogleRedirectError(url);
      if (refused) {
        if (!isUserCanceledSignIn(refused)) toast.error(socialSignInMessage(refused, 'Google'));
        return;
      }
      try {
        await handleAuthUrl(url);
      } catch (e) {
        logger.error('Auth deep link failed', { error: String(e) });
      }
    };

    Linking.getInitialURL().then(process);
    const sub = Linking.addEventListener('url', ({ url }) => process(url));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}
