import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@lib';
import type { WidgetMember } from './layout';

const CIRCLE_KEY = 'widget.circle_id';
const OWNER_KEY = 'widget.owner';
const WIDGET_KEY = 'widget.key';

/** The Private circle chosen in Profile → Home Widget (this phone only). */
export async function getWidgetCircleId(): Promise<string | null> {
  return AsyncStorage.getItem(CIRCLE_KEY);
}

export async function setWidgetCircleId(id: string | null): Promise<void> {
  if (id) await AsyncStorage.setItem(CIRCLE_KEY, id);
  else await AsyncStorage.removeItem(CIRCLE_KEY);
}

/** The account the widget settings on this phone belong to. */
export async function getWidgetOwner(): Promise<string | null> {
  return AsyncStorage.getItem(OWNER_KEY);
}

export async function setWidgetOwner(userId: string | null): Promise<void> {
  if (userId) await AsyncStorage.setItem(OWNER_KEY, userId);
  else await AsyncStorage.removeItem(OWNER_KEY);
}

/** This install's read-only widget key (kept in the device keychain), if it has one. */
export async function getStoredWidgetKey(): Promise<string | null> {
  return SecureStore.getItemAsync(WIDGET_KEY);
}

export async function storeWidgetKey(key: string | null): Promise<void> {
  if (key) await SecureStore.setItemAsync(WIDGET_KEY, key);
  else await SecureStore.deleteItemAsync(WIDGET_KEY);
}

/** Revoke this phone's key on the server (signing out); it stops working at once. */
export async function revokeWidgetKey(key: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_widget_key', { p_key: key });
  if (error) throw error;
}

/** Mint a new widget key for the signed-in user (the server keeps only its hash). */
export async function createWidgetKey(): Promise<string> {
  const { data, error } = await supabase.rpc('create_widget_key', {});
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('create_widget_key returned no key');
  return data;
}

export type WidgetFeed =
  | { error: 'invalid_key' | 'no_circle' }
  | {
      circle: string;
      /** OTHER approved members (the viewer is never in their own widget). */
      member_count: number;
      generated_at: number;
      members: WidgetMember[];
    };

/** The widget's data for one Private circle — the same call the iOS widget makes by itself. */
export async function fetchWidgetFeed(key: string, circleId: string): Promise<WidgetFeed> {
  const { data, error } = await supabase.rpc('widget_feed', { p_key: key, p_circle: circleId });
  if (error) throw error;
  return data as unknown as WidgetFeed; // shape defined by the widget_feed SQL function
}
