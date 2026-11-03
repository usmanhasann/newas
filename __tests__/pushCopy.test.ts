/**
 * Pure notification copy + recipient math for the send-push fan-out (the logic the Edge Function
 * calls, unit-tested here since Deno funcs aren't in the Jest program). Covers the post / join /
 * approval / reaction / shared-entry copy, actor + switched-off exclusion, and each circle's own
 * switches (no row = ON; across several circles, ANY circle on is enough).
 */
import {
  postPushCopy,
  joinRequestCopy,
  joinApprovedCopy,
  reactionCopy,
  sharedEntryCopy,
  recipientsFor,
  recipientsAcrossCircles,
  switchOn,
  anySwitchOn,
} from '../supabase/functions/_shared/pushCopy';

describe('postPushCopy', () => {
  it('reply copy names the actor, not the circle', () => {
    expect(postPushCopy('reply', 'Ada', 'Runners')).toEqual({
      title: 'New reply',
      body: 'Ada replied to your post.',
    });
  });

  it('distinguishes a Public new prompt from a Private new post', () => {
    expect(postPushCopy('new_prompt', 'Ada', 'Runners').body).toBe(
      'Ada shared a new prompt in Runners.',
    );
    expect(postPushCopy('new_post', 'Ada', 'Inner').body).toBe('Ada posted in Inner.');
    expect(postPushCopy('new_prompt', 'Ada', 'Runners').title).not.toBe(
      postPushCopy('new_post', 'Ada', 'Inner').title,
    );
  });
});

describe('join copy', () => {
  it('tells the owner who asked to join which circle', () => {
    expect(joinRequestCopy('Bo', 'Inner')).toEqual({
      title: 'New join request',
      body: 'Bo asked to join Inner.',
    });
  });

  it('tells the person who asked that they were approved', () => {
    expect(joinApprovedCopy('Inner')).toEqual({
      title: 'Request approved',
      body: 'Your request to join Inner was approved.',
    });
  });
});

describe('reaction + shared entry copy', () => {
  it('says what was reacted to', () => {
    expect(reactionCopy('entry', 'Ada')).toEqual({
      title: 'New reaction',
      body: 'Ada reacted to your shared mood.',
    });
    expect(reactionCopy('post', 'Ada').body).toBe('Ada reacted to your post.');
  });

  it('keeps the shared-entry wording', () => {
    expect(sharedEntryCopy('Ada')).toEqual({
      title: 'New shared mood',
      body: "Ada shared how they're feeling.",
    });
  });
});

describe('recipientsFor', () => {
  it('excludes the actor and de-duplicates', () => {
    expect(recipientsFor(['a', 'b', 'a', 'actor'], 'actor')).toEqual(['a', 'b']);
  });
  it('excludes anyone who switched it off', () => {
    expect(recipientsFor(['a', 'b', 'c'], 'actor', ['b'])).toEqual(['a', 'c']);
  });
  it('is empty when the only member is the actor', () => {
    expect(recipientsFor(['actor'], 'actor')).toEqual([]);
  });
  it('defaults to nobody switched off (default-ON)', () => {
    expect(recipientsFor(['a', 'b'], 'actor')).toEqual(['a', 'b']);
  });
});

describe('per-circle switches', () => {
  it('is ON with no saved row or no saved value, and follows a saved value', () => {
    expect(switchOn(undefined, 'replies')).toBe(true);
    expect(switchOn(null, 'replies')).toBe(true);
    expect(switchOn({ circle_id: 'c1' }, 'replies')).toBe(true);
    expect(switchOn({ circle_id: 'c1', replies: false }, 'replies')).toBe(false);
    expect(switchOn({ circle_id: 'c1', replies: false }, 'reactions')).toBe(true);
  });

  it('across several circles: on if ANY of them is on (missing row = on)', () => {
    const rows = [
      { circle_id: 'c1', reactions: false },
      { circle_id: 'c2', reactions: false },
    ];
    expect(anySwitchOn(rows, ['c1', 'c2'], 'reactions')).toBe(false);
    expect(anySwitchOn(rows, ['c1', 'c3'], 'reactions')).toBe(true); // c3 has no row → ON
    expect(anySwitchOn([{ circle_id: 'c1', reactions: true }], ['c1'], 'reactions')).toBe(
      true,
    );
    expect(anySwitchOn(rows, [], 'reactions')).toBe(false);
  });

  it('fan-out across circles: one push per person, if any of their circles allows it', () => {
    const recipients = recipientsAcrossCircles(
      [
        { memberIds: ['actor', 'a', 'b', 'c'], offIds: ['b', 'c'] },
        { memberIds: ['actor', 'b', 'd'], offIds: ['d'] },
      ],
      'actor',
    );
    // a: on in circle 1 · b: off in 1 but on in 2 · c: off in its only circle · d: off in its only circle
    expect(recipients.sort()).toEqual(['a', 'b']);
  });
});
