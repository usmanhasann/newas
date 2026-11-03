/**
 * System 3 — private-threat detection (client side). The on-device prescreen must catch threats
 * toward ANOTHER person while ignoring self-harm (System 2's job) and benign text, and it must gate
 * the network call so private text never leaves the phone without a hit. reportPrivateThreat is
 * fire-and-forget and must never throw.
 */
import { matchesPrivateThreatPrescreen, reportPrivateThreat } from '@features/safety';

jest.mock('@lib', () => ({
  supabase: {
    functions: { invoke: jest.fn(() => Promise.resolve({ data: { flagged: false }, error: null })) },
  },
}));

const { supabase } = jest.requireMock('@lib') as { supabase: { functions: { invoke: jest.Mock } } };
const mockInvoke = supabase.functions.invoke;

beforeEach(() => mockInvoke.mockClear());

describe('matchesPrivateThreatPrescreen — on-device prescreen', () => {
  it('flags a violence verb aimed at another person', () => {
    expect(matchesPrivateThreatPrescreen('I am going to kill him tomorrow')).toBe(true);
    expect(matchesPrivateThreatPrescreen('I want to hurt her so badly')).toBe(true);
    expect(matchesPrivateThreatPrescreen('I am going to hurt my boss')).toBe(true);
    expect(matchesPrivateThreatPrescreen('I will make my boss pay for this')).toBe(true);
    expect(matchesPrivateThreatPrescreen('I could stab them')).toBe(true);
  });

  it('does NOT flag self-harm (that is System 2, not System 3)', () => {
    expect(matchesPrivateThreatPrescreen('I want to kill myself')).toBe(false);
    expect(matchesPrivateThreatPrescreen('I am going to end it all')).toBe(false);
  });

  it('does NOT flag benign or figurative text', () => {
    expect(matchesPrivateThreatPrescreen('this workout is killing me')).toBe(false);
    expect(matchesPrivateThreatPrescreen('had a harmless, lovely day with them')).toBe(false);
    expect(matchesPrivateThreatPrescreen('I feel so grateful for her')).toBe(false);
    expect(matchesPrivateThreatPrescreen('')).toBe(false);
    expect(matchesPrivateThreatPrescreen(null)).toBe(false);
  });
});

describe('reportPrivateThreat — gated, fire-and-forget', () => {
  it('does not call the AI when the prescreen misses (nothing leaves the device)', async () => {
    await reportPrivateThreat({ text: 'a calm and grateful day', source: 'journal_entry', sourceId: 'e1' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls detect-private-threat with the excerpt + source when the prescreen hits', async () => {
    await reportPrivateThreat({
      text: 'I am going to kill him tomorrow',
      source: 'journal_entry',
      sourceId: 'e1',
    });
    expect(mockInvoke).toHaveBeenCalledWith('detect-private-threat', {
      body: { text: 'I am going to kill him tomorrow', source: 'journal_entry', source_id: 'e1' },
    });
  });

  it('never throws, even if the function call fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('network'));
    await expect(
      reportPrivateThreat({ text: 'I will hurt her', source: 'checkin_note' }),
    ).resolves.toBeUndefined();
  });
});
