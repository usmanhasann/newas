import {
  REFLECTION_TYPES,
  REFLECTION_TITLE,
  REFLECTION_PLACEHOLDER,
  reflectionCardState,
  nextUnlockSentence,
  readyOnSentence,
} from '@features/reflections/logic';

describe('reflections display logic (§7/§8)', () => {
  it('covers exactly weekly, monthly, yearly', () => {
    expect(REFLECTION_TYPES).toEqual(['weekly', 'monthly', 'yearly']);
  });

  it('uses the exact not-ready copy (client 10/14 p.1-2, O18.07)', () => {
    expect(REFLECTION_PLACEHOLDER.weekly).toBe(
      'Your weekly reflection will show here after a full week of journaling. Keep going!',
    );
    expect(REFLECTION_PLACEHOLDER.monthly).toBe(
      'Your monthly reflection will show here after a full month of journaling. Keep going!',
    );
    expect(REFLECTION_PLACEHOLDER.yearly).toBe(
      'Your yearly reflection will show here after a full year of journaling. Keep going!',
    );
  });

  it('phrases the not-ready "Ready on" line (O18.04/O18.08/O18.12)', () => {
    expect(readyOnSentence('September 7, 2027')).toBe('Ready on September 7, 2027.');
  });

  it('titles each section', () => {
    expect(REFLECTION_TITLE.weekly).toBe('Weekly Reflection');
    expect(REFLECTION_TITLE.monthly).toBe('Monthly Reflection');
    expect(REFLECTION_TITLE.yearly).toBe('Yearly Reflection');
  });

  describe('reflectionCardState', () => {
    it('shows a ready reflection (content always wins → stays visible)', () => {
      expect(
        reflectionCardState({ content: 'hello', generating: true, failed: true }),
      ).toBe('ready');
    });

    it('shows generating when a period is in progress and none is ready', () => {
      expect(
        reflectionCardState({ content: null, generating: true, failed: false }),
      ).toBe('generating');
    });

    it('shows failed when generation failed and nothing is ready', () => {
      expect(
        reflectionCardState({ content: null, generating: false, failed: true }),
      ).toBe('failed');
    });

    it('is locked otherwise (placeholder)', () => {
      expect(
        reflectionCardState({ content: null, generating: false, failed: false }),
      ).toBe('locked');
    });
  });

  it('phrases the next-unlock sentence', () => {
    expect(nextUnlockSentence('January 1, 2026')).toBe(
      'Your next reflection will be ready on January 1, 2026.',
    );
  });
});
