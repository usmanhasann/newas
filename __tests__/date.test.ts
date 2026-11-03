import {
  localDateInTZ,
  addDaysToLocalDate,
  diffLocalDays,
  formatLocalDateShort,
  formatLongLocalDate,
  formatLocalRange,
} from '@utils/date';

describe('date utils (timezone-aware bucketing)', () => {
  it('derives the local date in a given timezone', () => {
    // 02:00 UTC on Jun 19 is still Jun 18 in New York (UTC-4 in summer).
    const d = new Date('2026-06-19T02:00:00Z');
    expect(localDateInTZ(d, 'America/New_York')).toBe('2026-06-18');
    // ...but already Jun 19 in Karachi (UTC+5).
    expect(localDateInTZ(d, 'Asia/Karachi')).toBe('2026-06-19');
  });

  it('adds/subtracts whole days across month boundaries', () => {
    expect(addDaysToLocalDate('2026-06-19', -6)).toBe('2026-06-13');
    expect(addDaysToLocalDate('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToLocalDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('computes whole-day differences', () => {
    expect(diffLocalDays('2026-06-19', '2026-06-13')).toBe(6);
    expect(diffLocalDays('2026-06-13', '2026-06-19')).toBe(-6);
  });

  it('formats a short local date with a fallback', () => {
    expect(formatLocalDateShort('2026-06-19')).toBe('Jun 19');
    expect(formatLocalDateShort('2026-07-09')).toBe('Jul 9'); // single-digit day keeps the day
    expect(formatLocalDateShort('2026-07-09T12:34:56+00:00')).toBe('Jul 9'); // tolerates a timestamp
    expect(formatLocalDateShort(null)).toBe('');
    expect(formatLocalDateShort('2026-07')).toBe(''); // no day → fallback, never a bare month
  });

  it('formats a long unlock date without an off-by-one (§8)', () => {
    // Jan 1 must stay Jan 1 regardless of the runner's timezone.
    expect(formatLongLocalDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatLongLocalDate('2026-12-31')).toBe('December 31, 2026');
    expect(formatLongLocalDate(null)).toBe('');
  });

  it('formats a period range', () => {
    expect(formatLocalRange('2026-06-15', '2026-06-21')).toBe('Jun 15 to Jun 21');
    expect(formatLocalRange(null, '2026-06-21')).toBe('');
  });
});
