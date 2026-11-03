/**
 * Public surface of the moods feature — per-entry mood selection (overhaul spec
 * §1.2/§1.3) and the connected multi-mood picker used on every entry surface.
 */
export { MoodPicker } from './components/MoodPicker';
export type { MoodPickerProps } from './components/MoodPicker';
export {
  ENTRY_MOOD_LIMIT,
  toggleEntryMood,
  entryMoodSlotsRemaining,
  isEntryMoodLimitReached,
  disabledEntryMoodKeys,
  moodSlotsLabel,
} from './entrySelection';
export { selectedMoodsToday, todaysMoodOrder } from './todaysMoods';
