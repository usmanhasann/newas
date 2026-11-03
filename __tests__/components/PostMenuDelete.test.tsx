/**
 * Deleting circle content (client spec 2026-09-29). The confirmation names the real scope ("Delete
 * this post and its 2,847 replies? This can't be undone.") and nothing happens until "Delete".
 * Your own posts anywhere; a circle's owner may remove anything in it, Private circles too. Someone
 * else's post can be reported, not deleted. One render per file.
 */
import { Alert, Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { usePostMenu } from '@features/circles/postMenu';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
const mockReport = jest.fn((_i: unknown) => Promise.resolve());
jest.mock('@features/moderation', () => ({ reportContent: (i: unknown) => mockReport(i) }));
const mockTotal = jest.fn((_id: string) => Promise.resolve(2847));
jest.mock('@features/circles/postsApi', () => ({
  fetchReplyTotal: (id: string) => mockTotal(id),
}));
const mockDelete = jest.fn();
jest.mock('@features/circles/postsHooks', () => ({ useDeletePost: () => ({ mutate: mockDelete }) }));

type AlertButton = { text?: string; style?: string; onPress?: () => void };
const post = (over: Record<string, unknown>) =>
  ({ id: 'p1', parent_id: null, author_id: 'm-9', entry_id: null, reply_count: 3, ...over }) as never;

function Harness({ which }: { which: Record<string, unknown> }) {
  const open = usePostMenu({ owner_id: 'owner-1' });
  return (
    <Pressable onPress={() => open(post(which))}>
      <Text>open</Text>
    </Pressable>
  );
}

it('the owner removes a member’s post in a Private circle, after a confirmation with the real count', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const utils = await render(<Harness which={{}} />);

  fireEvent.press(utils.getByText('open'));
  const [menuTitle, , menu] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(menuTitle).toBe('Post options');
  expect(menu.map((b) => b.text)).toEqual(['Delete', 'Report', 'Cancel']);

  await act(async () => {
    menu[0]!.onPress!();
  });
  expect(mockTotal).toHaveBeenCalledWith('p1');
  const [title, message, confirm] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(title).toBe('Delete this post and its 2,847 replies?');
  expect(message).toBe('This can’t be undone.');
  expect(mockDelete).not.toHaveBeenCalled(); // nothing until they confirm
  const del = confirm.find((b) => b.text === 'Delete')!;
  expect(del.style).toBe('destructive');
  del.onPress!();
  expect(mockDelete).toHaveBeenCalledWith('p1', expect.anything());

  // Reporting someone else's post files a report for it.
  fireEvent.press(utils.getByText('open'));
  const [, , menu2] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  await act(async () => {
    menu2.find((b) => b.text === 'Report')!.onPress!();
  });
  expect(mockReport).toHaveBeenCalledWith({
    reporterId: 'owner-1',
    reportedUserId: 'm-9',
    targetType: 'circle_post',
    targetId: 'p1',
  });
});
