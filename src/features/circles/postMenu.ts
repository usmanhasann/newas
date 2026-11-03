import { Alert } from 'react-native';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { reportContent } from '@features/moderation';
import type { Circle } from '@app-types/database';
import { deletePostQuestion } from './postingLogic';
import { fetchReplyTotal, type PostWithAuthor } from './postsApi';
import { useDeletePost } from './postsHooks';

type AlertButton = { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void };

/**
 * The "…" menu on a post or reply. Delete: your own anywhere, and anything in a circle you own
 * (Public or Private). It asks first and names the real scope ("Delete this post and its 2,847
 * replies?"): everything under it goes too, with nothing left behind. Report: someone else's.
 */
export function usePostMenu(circle: Pick<Circle, 'owner_id'>, opts?: { onDeleted?: (p: PostWithAuthor) => void }) {
  const user = useCurrentUser();
  const del = useDeletePost();
  const isOwner = !!user && circle.owner_id === user.id;

  const confirmDelete = async (p: PostWithAuthor) => {
    let total = p.reply_count;
    try {
      total = await fetchReplyTotal(p.id);
    } catch {
      /* fall back to the direct replies we already know about */
    }
    const ownEntry = !!p.entry_id && p.author_id === user?.id;
    Alert.alert(
      deletePostQuestion(p.parent_id ? 'reply' : 'post', total),
      ownEntry
        ? 'This can’t be undone. Your journal entry stays in your journal.'
        : 'This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            del.mutate(p.id, {
              onSuccess: () => opts?.onDeleted?.(p),
              onError: () => toast.error('Couldn’t delete it. Try again.'),
            }),
        },
      ],
    );
  };

  return (p: PostWithAuthor) => {
    const mine = p.author_id === user?.id;
    const buttons: AlertButton[] = [];
    if (mine || isOwner) {
      buttons.push({ text: 'Delete', style: 'destructive', onPress: () => void confirmDelete(p) });
    }
    if (!mine) {
      buttons.push({
        text: 'Report',
        onPress: () => {
          if (!user) return;
          void reportContent({
            reporterId: user.id,
            reportedUserId: p.author_id,
            targetType: p.parent_id ? 'circle_comment' : 'circle_post',
            targetId: p.id,
          })
            .then(() => toast.success('Reported. Our team will review it.'))
            .catch(() => toast.error('Couldn’t submit the report. Try again.'));
        },
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Post options', undefined, buttons);
  };
}
