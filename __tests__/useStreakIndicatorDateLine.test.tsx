/**
 * Travel never breaks the streak badge on its own (client 10/14 p.30, N14.06): after flying west
 * across the date line, the last journaled day can be "tomorrow" in the phone's new zone. That still
 * counts as journaled today, so at 9pm the badge stays normal instead of turning urgent.
 * localDateInTZ/hourInTZ are stubbed so the case is deterministic. One render per file.
 */
import { renderHook } from '@testing-library/react-native';
import { useStreakIndicator } from '@features/journal';

jest.mock('@features/insights', () => ({
  // Journaled on Oct 21 in Tokyo, then flew to Honolulu, where it is still Oct 20.
  useJournalStats: () => ({ data: { current_streak: 4, last_entry_date: '2026-10-21' } }),
}));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'Pacific/Honolulu' } }) }));
jest.mock('@utils/date', () => ({
  localDateInTZ: () => '2026-10-20',
  hourInTZ: () => 21,
}));

it('counts a last entry dated after today (west across the date line) as journaled today', async () => {
  const { result } = await renderHook(() => useStreakIndicator());
  expect(result.current).toEqual({ state: 'normal', streak: 4 });
});
