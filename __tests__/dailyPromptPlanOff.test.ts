/**
 * The daily prompt's stored rotation when the check-in reminder is switched OFF, or its setting
 * can't be read (audit 2026-09-30):
 *  - switching off trims the days planned ahead, so the rotation carries on from TODAY's prompt
 *    (the next open day shows the next prompt, never one five days further along);
 *  - a read-only pick (setting unknown) shows today's prompt without rewriting the plan the
 *    reminder already scheduled.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_PROMPT_KEY, planDailyPrompts, todaysPrompt, trimDailyPlan } from '@features/journal/dailyPrompt';

const TODAY = '2026-09-30';

async function stored(): Promise<{ date: string }[]> {
  return JSON.parse((await AsyncStorage.getItem(DAILY_PROMPT_KEY)) ?? '[]');
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('switching the reminder off keeps only today’s pick, and the next open day moves on by one', async () => {
  const plan = await planDailyPrompts(TODAY);
  expect((await stored()).length).toBeGreaterThan(30);

  await trimDailyPlan(TODAY);
  const kept = await stored();
  expect(kept.map((s) => s.date)).toEqual([TODAY]);
  expect(await todaysPrompt(TODAY, false)).toBe(plan[0]!.prompt);

  // Five days later (reminder still off), the home screen shows the NEXT prompt after today's,
  // exactly what the plan had for tomorrow, not the one planned for day five.
  const later = await todaysPrompt('2026-10-05', false);
  expect(later).toBe(plan[1]!.prompt);
});

it('a read-only pick shows today’s prompt and never rewrites the saved plan', async () => {
  const plan = await planDailyPrompts(TODAY);
  const before = JSON.stringify(await stored());
  expect(await todaysPrompt(TODAY, false, undefined, { readOnly: true })).toBe(plan[0]!.prompt);
  expect(JSON.stringify(await stored())).toBe(before);
});

it('trimming is harmless when nothing is stored', async () => {
  await trimDailyPlan(TODAY);
  expect(await stored()).toEqual([]);
});
