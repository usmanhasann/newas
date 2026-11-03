import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@lib';

export async function submitFeedback(
  userId: string,
  message: string,
  category: string,
): Promise<void> {
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    message: message.trim(),
    category,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? null,
  });
  if (error) throw error;
}
