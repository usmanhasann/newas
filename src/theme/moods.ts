/**
 * Mood definitions — the client-side single source of truth for mood visuals.
 * Colors come from the design tokens (src/theme/tokens.cjs). The DB `moods` table
 * mirrors this list (slug/label/icon/sort/color) so the server + native widget can
 * render moods too — keep supabase/seed in sync with this file.
 *
 * Moods are rendered with a non-emoji vector icon (Ionicons) + color + text label
 * (build task §6) — never an emoji. The `slug`/`key` is the stable identifier.
 *
 * `frustrated` is required by master_spec. Palette is INVENTED per client latitude
 * and pending sign-off (see memory: inner-circle-design-decisions).
 */
import { colors } from './tokens';

/**
 * Ionicons names used for moods. Declared as a literal union (rather than importing
 * the icon library here) so this module stays dependency-free + Jest-friendly; each
 * value is a valid Ionicons glyph, so it's assignable to the Ionicons `name` prop.
 */
export type MoodIconName =
  | 'happy-outline'
  | 'sunny-outline'
  | 'leaf-outline'
  | 'heart-outline'
  | 'moon-outline'
  | 'ellipse-outline'
  | 'pulse-outline'
  | 'sad-outline'
  | 'thunderstorm-outline'
  | 'flame-outline';

export const MOOD_KEYS = [
  'happy',
  'content',
  'calm',
  'grateful',
  'tired',
  'neutral',
  'anxious',
  'sad',
  'frustrated',
  'angry',
] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];

export interface MoodDef {
  key: MoodKey;
  label: string;
  /** Non-emoji vector icon (Ionicons) shown alongside the label + color (§6). */
  icon: MoodIconName;
  /** Saturated indicator dot. */
  dot: string;
  /** Pastel pill fill. */
  bg: string;
  /** Pill label color (AA contrast on `bg`). */
  ink: string;
  /** Display order (also used as DB sort_order). */
  sort: number;
}

const m = colors.mood;

export const MOODS: Record<MoodKey, MoodDef> = {
  happy: {
    key: 'happy',
    label: 'Happy',
    icon: 'happy-outline',
    dot: m.happy,
    bg: m['happy-bg'],
    ink: m['happy-ink'],
    sort: 10,
  },
  content: {
    key: 'content',
    label: 'Content',
    icon: 'sunny-outline',
    dot: m.content,
    bg: m['content-bg'],
    ink: m['content-ink'],
    sort: 20,
  },
  calm: {
    key: 'calm',
    label: 'Calm',
    icon: 'leaf-outline',
    dot: m.calm,
    bg: m['calm-bg'],
    ink: m['calm-ink'],
    sort: 30,
  },
  grateful: {
    key: 'grateful',
    label: 'Grateful',
    icon: 'heart-outline',
    dot: m.grateful,
    bg: m['grateful-bg'],
    ink: m['grateful-ink'],
    sort: 40,
  },
  tired: {
    key: 'tired',
    label: 'Tired',
    icon: 'moon-outline',
    dot: m.tired,
    bg: m['tired-bg'],
    ink: m['tired-ink'],
    sort: 50,
  },
  neutral: {
    key: 'neutral',
    label: 'Neutral',
    icon: 'ellipse-outline',
    dot: m.neutral,
    bg: m['neutral-bg'],
    ink: m['neutral-ink'],
    sort: 60,
  },
  anxious: {
    key: 'anxious',
    label: 'Anxious',
    icon: 'pulse-outline',
    dot: m.anxious,
    bg: m['anxious-bg'],
    ink: m['anxious-ink'],
    sort: 70,
  },
  sad: {
    key: 'sad',
    label: 'Sad',
    icon: 'sad-outline',
    dot: m.sad,
    bg: m['sad-bg'],
    ink: m['sad-ink'],
    sort: 80,
  },
  frustrated: {
    key: 'frustrated',
    label: 'Frustrated',
    icon: 'thunderstorm-outline',
    dot: m.frustrated,
    bg: m['frustrated-bg'],
    ink: m['frustrated-ink'],
    sort: 90,
  },
  angry: {
    key: 'angry',
    label: 'Angry',
    icon: 'flame-outline',
    dot: m.angry,
    bg: m['angry-bg'],
    ink: m['angry-ink'],
    sort: 100,
  },
};

export const MOOD_LIST: MoodDef[] = MOOD_KEYS.map((k) => MOODS[k]);

export function isMoodKey(value: string): value is MoodKey {
  return (MOOD_KEYS as readonly string[]).includes(value);
}

/** Safe lookup with a neutral fallback (never throws on unknown server data). */
export function getMood(key: string | null | undefined): MoodDef {
  if (key && isMoodKey(key)) return MOODS[key];
  return MOODS.neutral;
}
