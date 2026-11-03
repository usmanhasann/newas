/**
 * send-push "share_created" (a journal entry shared into Private circles): each person is told once,
 * and the push now names the circle (and its post) it was shared in, so tapping it can open that
 * circle (client revisions 10/14 p.8; before, a shared-entry push named no circle). The people told
 * are exactly the ones the single combined push reached before. The pure module the Edge Function
 * calls (Deno functions aren't in the Jest program).
 */
import {
  sharePushData,
  sharePushGroups,
  type ShareCircle,
} from '../supabase/functions/send-push/sharePush';
import { recipientsAcrossCircles } from '../supabase/functions/_shared/pushCopy';

const circle = (over: Partial<ShareCircle> & { circleId: string }): ShareCircle => ({
  postId: `post-${over.circleId}`,
  memberIds: [],
  offIds: [],
  ...over,
});

describe('sharePushGroups', () => {
  it('one push per circle, never to the author, never to someone who switched it off', () => {
    const groups = sharePushGroups(
      [
        circle({ circleId: 'family', memberIds: ['author', 'mum', 'dad'], offIds: ['dad'] }),
        circle({ circleId: 'friends', memberIds: ['author', 'sam'] }),
      ],
      'author',
    );
    expect(groups).toEqual([
      { circleId: 'family', postId: 'post-family', recipients: ['mum'] },
      { circleId: 'friends', postId: 'post-friends', recipients: ['sam'] },
    ]);
  });

  it('someone in several of the circles is told once, about the first circle where it is on', () => {
    const groups = sharePushGroups(
      [
        // Sam turned these off in Family, so Sam hears about it from Friends.
        circle({ circleId: 'family', memberIds: ['mum', 'sam', 'ali'], offIds: ['sam'] }),
        circle({ circleId: 'friends', memberIds: ['sam', 'ali', 'jo'] }),
      ],
      'author',
    );
    expect(groups).toEqual([
      { circleId: 'family', postId: 'post-family', recipients: ['mum', 'ali'] },
      { circleId: 'friends', postId: 'post-friends', recipients: ['sam', 'jo'] },
    ]);
    const told = groups.flatMap((g) => g.recipients);
    expect(new Set(told).size).toBe(told.length); // nobody twice
  });

  it('a circle where nobody is left to tell sends nothing; duplicates in a list are told once', () => {
    const groups = sharePushGroups(
      [
        circle({ circleId: 'quiet', memberIds: ['author', 'kim'], offIds: ['kim'] }),
        circle({ circleId: 'busy', memberIds: ['lee', 'lee', 'author'] }),
      ],
      'author',
    );
    expect(groups).toEqual([{ circleId: 'busy', postId: 'post-busy', recipients: ['lee'] }]);
    expect(sharePushGroups([], 'author')).toEqual([]);
  });

  it('tells exactly the people the single combined push used to reach', () => {
    const circles = [
      circle({ circleId: 'a', memberIds: ['author', 'u1', 'u2', 'u3'], offIds: ['u2'] }),
      circle({ circleId: 'b', memberIds: ['u2', 'u3', 'u4', 'u5'], offIds: ['u5', 'u3'] }),
      circle({ circleId: 'c', memberIds: ['u5', 'u6', 'author'], offIds: ['u6'] }),
    ];
    const told = sharePushGroups(circles, 'author').flatMap((g) => g.recipients);
    expect([...told].sort()).toEqual(
      [...recipientsAcrossCircles(circles, 'author')].sort(),
    );
  });
});

describe('sharePushData', () => {
  it('names the entry, the circle and its post; the type is unchanged for older app builds', () => {
    expect(sharePushData('e1', { circleId: 'c1', postId: 'p1' })).toEqual({
      type: 'share_created',
      entry_id: 'e1',
      circle_id: 'c1',
      post_id: 'p1',
    });
  });

  it('leaves the post out when it could not be read (the circle still opens)', () => {
    expect(sharePushData('e1', { circleId: 'c1', postId: null })).toEqual({
      type: 'share_created',
      entry_id: 'e1',
      circle_id: 'c1',
    });
  });
});
