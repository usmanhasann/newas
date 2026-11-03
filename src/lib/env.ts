/**
 * Client environment config. Only NON-secret, client-safe values here (Supabase URL +
 * anon key + Sentry DSN). Privileged keys (OpenRouter, Resend, FCM/APNs, store server
 * validation) NEVER reach the client — they live in Supabase/EAS secrets and are used
 * only by Edge Functions (build prompt §6).
 *
 * EXPO_PUBLIC_* vars are read with STATIC member access so Expo inlines them at build
 * (dynamic process.env[...] access would not be inlined). app.config.ts `extra` is a
 * fallback. If unset we don't hard-crash; `isSupabaseConfigured` lets the UI explain.
 *
 * `billingEnvironment` is a generic dev/prod partition for the `subscriptions` table (so
 * a user can hold an independent test vs. production entitlement); it maps to the store
 * sandbox vs. production environment for in-app purchases.
 */
import Constants from 'expo-constants';
import { z } from 'zod';

export type BillingEnvironment = 'development' | 'production';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

function pick(primary: string | undefined, fallback: unknown): string | undefined {
  if (typeof primary === 'string' && primary.length > 0) return primary;
  return typeof fallback === 'string' && fallback.length > 0 ? fallback : undefined;
}

const appVariant = pick(process.env.APP_VARIANT, extra.appVariant) ?? 'development';
const billingEnvironment: BillingEnvironment =
  appVariant === 'production' ? 'production' : 'development';

// Google native sign-in — client-safe OAuth client ids. Empty => native Google is
// disabled and the sign-in falls back to the in-app browser OAuth flow (auth/social.ts).
const googleWebClientId =
  pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, extra.googleWebClientId) ?? '';
const googleIosClientId =
  pick(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, extra.googleIosClientId) ?? '';

const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
  sentryDsn: z.string().default(''),
  appVariant: z.enum(['development', 'staging', 'production']).default('development'),
  billingEnvironment: z.enum(['development', 'production']).default('development'),
  googleWebClientId: z.string().default(''),
  googleIosClientId: z.string().default(''),
});

const raw = {
  supabaseUrl: pick(process.env.EXPO_PUBLIC_SUPABASE_URL, extra.supabaseUrl),
  supabaseAnonKey: pick(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, extra.supabaseAnonKey),
  sentryDsn: pick(process.env.EXPO_PUBLIC_SENTRY_DSN, extra.sentryDsn) ?? '',
  appVariant,
  billingEnvironment,
  googleWebClientId,
  googleIosClientId,
};

const parsed = schema.safeParse(raw);

export const isSupabaseConfigured = parsed.success;

if (!parsed.success) {
  console.error(
    '[env] Supabase config missing/invalid. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env (see .env.example).',
    parsed.error.flatten().fieldErrors,
  );
}

export const env = parsed.success
  ? parsed.data
  : {
      // Safe placeholders so the bundle still boots; network calls will fail clearly.
      supabaseUrl: 'http://localhost:54321',
      supabaseAnonKey: 'anon-key-not-configured',
      sentryDsn: '',
      appVariant: 'development' as const,
      billingEnvironment: 'development' as const,
      googleWebClientId: '',
      googleIosClientId: '',
    };

/** Native Google Sign-In is usable only once a web client id is configured. */
export const isGoogleNativeConfigured = env.googleWebClientId.length > 0;
