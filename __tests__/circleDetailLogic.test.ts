/**
 * Client revisions 10/14: the circle page's leave confirmation (p.17) and the circle description's
 * 150 character cap, counter and header line (p.29). Exact text, character for character.
 */
import {
  CIRCLE_DESCRIPTION_MAX_LENGTH,
  circleDescriptionCounter,
  circleHeaderDescription,
  leaveCircleQuestion,
} from '@features/circles/postingLogic';

describe('circleDescriptionCounter', () => {
  it('is capped at 150 and reads "[count]/150" with no spaces', () => {
    expect(CIRCLE_DESCRIPTION_MAX_LENGTH).toBe(150);
    expect(circleDescriptionCounter('')).toBe('0/150');
    expect(circleDescriptionCounter('x'.repeat(45))).toBe('45/150');
    expect(circleDescriptionCounter('a b')).toBe('3/150'); // spaces count
    expect(circleDescriptionCounter('y'.repeat(150))).toBe('150/150');
  });
});

describe('circleHeaderDescription', () => {
  it('shows a Public circle’s description', () => {
    expect(circleHeaderDescription({ type: 'public', description: 'People who run.' })).toBe(
      'People who run.',
    );
  });

  it('trims it, and leaves the line out when there is nothing to show', () => {
    expect(circleHeaderDescription({ type: 'public', description: '  Morning miles.  ' })).toBe(
      'Morning miles.',
    );
    expect(circleHeaderDescription({ type: 'public', description: null })).toBeNull();
    expect(circleHeaderDescription({ type: 'public', description: '' })).toBeNull();
    expect(circleHeaderDescription({ type: 'public', description: '   ' })).toBeNull();
  });

  it('never shows one for a Private circle', () => {
    expect(circleHeaderDescription({ type: 'private', description: 'Our people.' })).toBeNull();
  });
});

describe('leaveCircleQuestion', () => {
  it('Private: "Leave [circle name]?" plus the new invite line', () => {
    expect(leaveCircleQuestion({ name: 'Family', type: 'private' })).toEqual({
      title: 'Leave Family?',
      message: 'You’ll need a new invite to rejoin.',
    });
  });

  it('Public: the title only, no second line', () => {
    expect(leaveCircleQuestion({ name: 'Runners', type: 'public' })).toEqual({
      title: 'Leave Runners?',
      message: undefined,
    });
  });
});
