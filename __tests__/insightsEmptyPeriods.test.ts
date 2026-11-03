/**
 * Client 10/14 p.13-14 (O7): the Insights cards move on to every finished period, empty or not.
 * Locks the card state rules and the server fields the app reads for it.
 */
import { reflectionCardState, REFLECTION_EMPTY } from '@features/reflections/logic';
import { fetchBreakdownPeriods } from '@features/insights/api';
import { fetchReflectionsOverview } from '@features/reflections/api';

const mockRpc = jest.fn();
jest.mock('@lib', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));

const base = { content: null, generating: false, failed: false };

describe('reflectionCardState: the newest finished period decides the card', () => {
  it('an empty finished period → the empty state (not an older reflection, not "locked")', () => {
    expect(reflectionCardState({ ...base, periodStart: '2026-09-21', periodHasEntries: false })).toBe('empty');
    expect(REFLECTION_EMPTY).toBe('No entries in this period yet. Journal to see your reflection here.');
  });
  it('a finished period with entries and no reflection yet → being prepared', () => {
    expect(reflectionCardState({ ...base, periodStart: '2026-09-28', periodHasEntries: true })).toBe('generating');
  });
  it('ready / pending / failed for that period', () => {
    expect(reflectionCardState({ ...base, content: 'x', periodStart: '2026-09-14', periodHasEntries: true })).toBe('ready');
    expect(reflectionCardState({ ...base, generating: true, periodStart: '2026-09-28', periodHasEntries: true })).toBe('generating');
    expect(reflectionCardState({ ...base, failed: true, periodStart: '2026-09-28', periodHasEntries: true })).toBe('failed');
  });
  it('no reflection made and the request to make it ended → Try again, never an endless spinner', () => {
    const o = { ...base, periodStart: '2026-09-28', periodHasEntries: true };
    expect(reflectionCardState(o, false)).toBe('generating'); // the request is still running
    expect(reflectionCardState(o, true)).toBe('failed'); // it ended and nothing was made
    // A reflection that IS being made keeps its spinner even after the request returned.
    expect(reflectionCardState({ ...o, generating: true }, true)).toBe('generating');
  });
  it('an older server (no period_has_entries): a ready reflection still shows', () => {
    expect(reflectionCardState({ ...base, content: 'x', periodStart: '2026-09-14', periodHasEntries: undefined })).toBe('ready');
  });
  it('no period finished yet → locked (the not-ready text)', () => {
    expect(reflectionCardState({ ...base, periodStart: null, periodHasEntries: null })).toBe('locked');
    expect(reflectionCardState(base)).toBe('locked');
  });
});

describe('server fields', () => {
  beforeEach(() => mockRpc.mockReset());
  it('breakdown periods carry has_entries (a server from before the change: entries assumed)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { type: 'weekly', period_start: '2026-09-21', period_end: '2026-09-27', has_entries: false },
        { type: 'monthly', period_start: '2026-08-14', period_end: '2026-09-13' },
      ],
      error: null,
    });
    await expect(fetchBreakdownPeriods('2026-09-28')).resolves.toEqual([
      { type: 'weekly', start: '2026-09-21', end: '2026-09-27', hasEntries: false },
      { type: 'monthly', start: '2026-08-14', end: '2026-09-13', hasEntries: true },
    ]);
  });
  it('the reflections overview carries period_has_entries', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          type: 'weekly',
          has_any_entry: true,
          next_unlock_date: '2026-10-05',
          content: null,
          period_start: '2026-09-21',
          period_end: '2026-09-27',
          generated_at: null,
          generating: false,
          failed: false,
          period_has_entries: false,
        },
      ],
      error: null,
    });
    const [weekly] = await fetchReflectionsOverview('2026-09-28');
    expect(weekly).toMatchObject({ periodStart: '2026-09-21', periodEnd: '2026-09-27', periodHasEntries: false });
  });
  it('an older server without period_has_entries maps to null (the old behaviour)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ type: 'weekly', has_any_entry: true, next_unlock_date: '2026-10-05', content: 'x', period_start: '2026-09-14', period_end: '2026-09-20', generated_at: null, generating: false, failed: false }],
      error: null,
    });
    const [weekly] = await fetchReflectionsOverview('2026-09-28');
    expect(weekly?.periodHasEntries).toBeNull();
  });
});
