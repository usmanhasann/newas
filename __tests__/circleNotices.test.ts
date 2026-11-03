/**
 * Circle notices sent by send-push / circle-join-digest (the pure module the Edge Functions call;
 * Deno functions aren't in the Jest program):
 *  - archive / unarchive (client revisions 10/14 p.24): the client's text word for word, to everyone
 *    except the owner; nobody who turned off every switch they have for that circle gets the push;
 *  - new members (p.9): "[Name] joined [Circle name]." and "[Name] and [N] others joined [Circle
 *    name].", tapping opens the circle's Members tab.
 */
import {
  archiveNoticeCopy,
  archiveNoticeData,
  mutedCircleFilter,
  isUuid,
  joinNoticeCopy,
  joinNoticeData,
  memberSwitchKeys,
} from '../supabase/functions/_shared/circleNotices';
import { circleNotificationSwitches } from '@features/circles/notificationSwitches';

describe('archiveNoticeCopy', () => {
  it('archived: the client’s sentence, with the circle’s name', () => {
    expect(archiveNoticeCopy('archived', 'Konah’s Friends')).toEqual({
      title: 'Circle archived',
      body: 'Konah’s Friends has been archived. You can still read it, but no new posts can be added.',
    });
  });

  it('unarchived: the client’s sentence, with the circle’s name', () => {
    expect(archiveNoticeCopy('unarchived', 'Book club')).toEqual({
      title: 'Circle active again',
      body: 'Book club is active again. You can post and reply again.',
    });
  });

  it('no dash punctuation in any of it', () => {
    for (const kind of ['archived', 'unarchived'] as const) {
      const { title, body } = archiveNoticeCopy(kind, 'Runners');
      expect(`${title} ${body}`).not.toMatch(/[–—]| - /);
    }
  });

  it('carries what the app needs to open the circle', () => {
    expect(archiveNoticeData('archived', 'c1')).toEqual({ type: 'circle_archived', circle_id: 'c1' });
    expect(archiveNoticeData('unarchived', 'c1')).toEqual({ type: 'circle_unarchived', circle_id: 'c1' });
  });
});

describe('joinNoticeCopy', () => {
  it('one person: "[Name] joined [Circle name]."', () => {
    expect(joinNoticeCopy('Auguste', 1, 'Konah Public Circle')).toEqual({
      title: 'New member',
      body: 'Auguste joined Konah Public Circle.',
    });
  });

  it('several close together: "[Name] and [N] others joined [Circle name]." (the client’s example)', () => {
    expect(joinNoticeCopy('Auguste', 5, 'Konah Public Circle')).toEqual({
      title: 'New members',
      body: 'Auguste and 4 others joined Konah Public Circle.',
    });
  });

  it('two people read "1 other", and big numbers get a thousands comma', () => {
    expect(joinNoticeCopy('Ana', 2, 'Book club').body).toBe('Ana and 1 other joined Book club.');
    expect(joinNoticeCopy('Ana', 1235, 'Book club').body).toBe('Ana and 1,234 others joined Book club.');
  });

  it('opens the circle on its Members tab', () => {
    expect(joinNoticeData('c9')).toEqual({ type: 'member_joined', circle_id: 'c9', tab: 'members' });
  });
});

describe('notifications off for a circle (the bell)', () => {
  it('the server knows the same member switches the bell screen shows', () => {
    for (const isPublic of [true, false]) {
      const app = circleNotificationSwitches({ isPublic, isOwner: false }).map((s) => s.key);
      expect(memberSwitchKeys(isPublic)).toEqual(app);
    }
  });

  // send-push skips the members whose saved row matches this filter: EVERY switch they have there
  // off. Anyone with no saved row (all on by default) or one switch still on is not matched.
  it('muted only when EVERY switch they have there is off', () => {
    expect(mutedCircleFilter(true)).toEqual({ replies: false, reactions: false, new_prompts: false });
    expect(mutedCircleFilter(false)).toEqual({
      replies: false,
      reactions: false,
      new_entries: false,
      new_posts: false,
    });
  });

  it('a saved row is muted exactly when it matches the filter', () => {
    const matches = (row: Record<string, boolean>, isPublic: boolean) =>
      Object.entries(mutedCircleFilter(isPublic)).every(([k, v]) => row[k] === v);
    expect(matches({ replies: false, reactions: false, new_prompts: false, new_posts: true }, true)).toBe(true);
    expect(matches({ replies: false, reactions: false, new_prompts: true }, true)).toBe(false);
    expect(matches({ replies: false, reactions: false, new_entries: false, new_posts: true }, false)).toBe(
      false,
    );
  });
});

describe('isUuid', () => {
  it('accepts an id, refuses anything else the app could send', () => {
    expect(isUuid('2f1c0a3e-6b1d-4c7e-9a52-0d3e5b7f9a11')).toBe(true);
    for (const bad of ['', 'abc', '2f1c0a3e-6b1d-4c7e-9a52', 42, null, undefined, { id: 'x' }]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
