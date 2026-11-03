/**
 * Archived circles in Your Circles and at the top of the circle (client revisions 10/14 p.23-24):
 * the gray line under the name ends with "Archived" ("Private · Owner · Archived", "Public · Member
 * · Archived") for everyone in the circle, owners and members, Public and Private; and the label at
 * the top of an archived circle reads exactly "This circle has been archived."
 */
import { ARCHIVED_CIRCLE_LABEL, circleRoleLine } from '@features/circles/postingLogic';

const ARCHIVED = '2026-10-20T09:00:00Z';

describe('circleRoleLine', () => {
  it('archived: "Archived" at the end, for owners and members alike (the client’s examples)', () => {
    expect(circleRoleLine({ type: 'private', role: 'owner', archived_at: ARCHIVED })).toBe(
      'Private · Owner · Archived',
    );
    expect(circleRoleLine({ type: 'public', role: 'member', archived_at: ARCHIVED })).toBe(
      'Public · Member · Archived',
    );
    expect(circleRoleLine({ type: 'public', role: 'owner', archived_at: ARCHIVED })).toBe(
      'Public · Owner · Archived',
    );
    expect(circleRoleLine({ type: 'private', role: 'member', archived_at: ARCHIVED })).toBe(
      'Private · Member · Archived',
    );
  });

  it('active circles keep the line as it was', () => {
    expect(circleRoleLine({ type: 'public', role: 'owner', archived_at: null })).toBe('Public · Owner');
    expect(circleRoleLine({ type: 'private', role: 'member', archived_at: null })).toBe(
      'Private · Member',
    );
  });
});

it('the label at the top of an archived circle, word for word', () => {
  expect(ARCHIVED_CIRCLE_LABEL).toBe('This circle has been archived.');
});
