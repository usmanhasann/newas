import { decode } from 'base64-arraybuffer';
import { supabase } from '@lib';

/**
 * Upload an avatar to the public `avatars` bucket under <userId>/avatar.<ext>.
 * Takes base64 (from expo-image-picker) so we avoid RN blob/arraybuffer quirks.
 * Returns a cache-busted public URL to store on profiles.avatar_url.
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  ext: 'jpg' | 'png' = 'jpg',
): Promise<string> {
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
