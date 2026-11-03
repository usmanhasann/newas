import { supabase } from '@lib';
import { pendingNameFor, usePendingNameStore } from '@store/pendingName';
import { forgetAppleName, recallAppleName } from '@store/appleName';
import type { Profile } from '@app-types/database';
import { stripCheckMarks } from '@utils/nameSymbols';
import { timeZoneSchema } from './timezone';

/**
 * The user's own profile, including the admin-only verified badge flag (N7, migration
 * 20261022060000: `select('*')` returns it; it isn't in the shared generated types yet).
 */
export type MyProfile = Profile & { verified?: boolean };

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('user_id', userId);
  if (error) throw error;
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'bio'
    | 'avatar_url'
    | 'timezone'
    | 'personal_reflection_style'
    | 'personal_reflection_style_secondary'
  >
>;

export async function updateMyProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Save the phone's time zone on the profile (useSyncProfileTimezone). The server reads it for the
 * 8 PM streak reminder, the 9 AM recaps and each day's date, so a zone this app can't read is
 * never sent (the database re-checks it).
 */
export async function saveMyTimezone(userId: string, zone: string): Promise<Profile> {
  return updateMyProfile(userId, { timezone: timeZoneSchema.parse(zone) });
}

/** The part of an email before "@" ("konah.q@gmail.com" → "konah.q"), or null. */
export function emailStart(email: string | null | undefined): string | null {
  const start = email?.split('@')[0]?.trim();
  return start || null;
}

/**
 * The name to put on a profile, or null to leave it as it is. Only an EMPTY profile name is ever
 * filled, so a name the user set (Edit Profile) is never overwritten (client 10/14 p.10). It gets
 * the real name (typed at sign-up, or shared by Apple / Google); with none, and only when allowed,
 * the email's first part (client 10/14 p.3: a name must always be saved; fallback chosen
 * 2026-10-16). Check marks are taken out (client 10/14 p.5: names can't carry them, and the
 * database refuses a name that does), so a Google / Apple name with one is still saved.
 */
export function displayNameToSave(
  current: string | null | undefined,
  realName: string | null | undefined,
  email: string | null | undefined,
  allowEmailFallback: boolean,
): string | null {
  if (current?.trim()) return null;
  const real = stripCheckMarks(realName ?? '');
  if (real) return real;
  const start = allowEmailFallback ? emailStart(email) : null;
  return start ? stripCheckMarks(start) || null : null;
}

/**
 * Put the user's name on their profile (client 10/14 p.3 + p.10: every account gets a real name
 * from the start). Onboarding starts on an ANONYMOUS user, so handle_new_user() creates the
 * profiles row with no name; the name arrives later in auth user_metadata (typed name / Apple →
 * display_name, Google → full_name/name), which that INSERT-only trigger never sees.
 *
 * Name order: the one passed in, Apple's one-time name held for this account's sign-in
 * (usePendingNameStore), Apple's name kept on the phone for this account's Apple ID
 * (@store/appleName: covers a failed save after the sign-in), the account's display_name,
 * full_name, name, then the name on a linked provider identity (Google's identity_data, in case
 * linking didn't copy it to the account). The email fallback is used only when
 * `allowEmailFallback` says the real name has had its chance to arrive (see the callers), so it can
 * never get in ahead of a real name.
 *
 * Runs right after sign-up / sign-in and again on every app start (useEnsureDisplayName), so a
 * name whose first save failed is still filled. It always targets the account signed in NOW: after
 * an Apple fallback sign-in the session is a different user from the one the screen started with.
 * The write only lands while the name is still empty, so a name the user saves in the meantime
 * always wins. Returns the updated profile, or null when there's nothing to do.
 */
export async function syncDisplayNameFromAuth(
  explicitName?: string,
  { allowEmailFallback = true }: { allowEmailFallback?: boolean } = {},
): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const appleId = appleUserIdOf(user);
  const keptAppleName = await recallAppleName(appleId);
  const realName = accountName(user, explicitName, keptAppleName);

  const { data: existing, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return null; // no profile row (yet): nothing to fill
  if (existing.display_name?.trim()) {
    await doneWithHeldNames(user.id, appleId); // already named: not needed any more
    return null;
  }

  const name = displayNameToSave(existing.display_name, realName, user.email, allowEmailFallback);
  if (!name) return null;
  const { data: updated, error: writeError } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('user_id', user.id)
    .or('display_name.is.null,display_name.eq.')
    .select('*')
    .maybeSingle();
  if (writeError) throw writeError;
  await doneWithHeldNames(user.id, appleId); // on the profile now (or the user named it meanwhile)
  return updated ?? null;
}

async function doneWithHeldNames(userId: string, appleId: string | undefined): Promise<void> {
  if (pendingNameFor(userId)) usePendingNameStore.getState().clear();
  await forgetAppleName(appleId);
}

type AccountForName = {
  id: string;
  user_metadata?: Record<string, unknown> | null;
  identities?: { provider?: string; identity_data?: Record<string, unknown> | null }[] | null;
};

/** The Apple user id (`sub`) of the account's Apple identity, if it has one. */
function appleUserIdOf(user: AccountForName): string | undefined {
  const sub = user.identities?.find((i) => i.provider === 'apple')?.identity_data?.sub;
  return typeof sub === 'string' && sub ? sub : undefined;
}

/**
 * The real name an account holds (see syncDisplayNameFromAuth for the order), or null. Exported so
 * useEnsureDisplayName can tell when it changes.
 */
export function accountName(
  user: AccountForName,
  explicitName?: string,
  keptAppleName?: string | null,
): string | null {
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const identities = [...(user.identities ?? [])].sort(
    (a, b) => Number(b.provider === 'google') - Number(a.provider === 'google'),
  );
  const fromIdentities = identities.flatMap((i) => [i.identity_data?.full_name, i.identity_data?.name]);
  return (
    [
      explicitName,
      pendingNameFor(user.id),
      keptAppleName,
      md.display_name,
      md.full_name,
      md.name,
      ...fromIdentities,
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find(Boolean) ?? null
  );
}
