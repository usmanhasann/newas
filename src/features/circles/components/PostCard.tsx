import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, MoodPillGroup, Text, VerifiedBadge } from '@components';
import { colors } from '@theme';
import { formatEntryDateTime } from '@utils/date';
import { withoutDashes } from '@utils/text';
import { viewRepliesLabel } from '../postingLogic';
import type { PostWithAuthor } from '../postsApi';

export interface PostCardProps {
  post: PostWithAuthor;
  /** 0 = a post, prompt or group head; 1 = a reply inside a group (indented). */
  depth?: 0 | 1;
  canReply: boolean;
  canReact: boolean;
  /** Whether this card's replies are showing. Pass onToggleReplies to offer "View N replies". */
  repliesOpen?: boolean;
  onToggleReplies?: () => void;
  /** Tapping the card opens its own page (where you can reply to it). */
  onOpen?: () => void;
  onHeart: () => void;
  /** Reply to this post / reply. */
  onReply: () => void;
  /** Overflow menu (delete / report). */
  onMenu: () => void;
  /** A reflection share still waiting for its AI reflection (author only): ask for it again. */
  onRetryReflection?: () => void;
}

const INDENT = 24;

/**
 * One message in a circle. A shared journal entry looks the same as any post (same card); when it
 * shows the AI reflection rather than the person's own words, a small ✨ sits next to the time.
 * Moods, when attached, show as pills. A reply inside a group starts with the "@" person it answers.
 * A verified person (N7) has the purple badge right after their name, as author and as the "@".
 */
export function PostCard({
  post,
  depth = 0,
  canReply,
  canReact,
  repliesOpen = false,
  onToggleReplies,
  onOpen,
  onHeart,
  onReply,
  onMenu,
  onRetryReflection,
}: PostCardProps) {
  const name = post.author?.display_name ?? 'Someone';
  const { date, time } = formatEntryDateTime(post.created_at);
  const isReflection = post.entry_version === 'reflection';
  const pending = post.body === null; // a reflection share still being written (author only)
  // The AI reflection is cleaned like everywhere else it's shown; people's own words are left as is.
  const text = isReflection && post.body ? withoutDashes(post.body) : post.body;

  return (
    <View style={{ marginLeft: depth * INDENT }}>
      <Card className="mb-2">
        <View className="flex-row items-center gap-2">
          <Avatar uri={post.author?.avatar_url} size={depth ? 26 : 30} />
          {/* The verified badge sits right after the name (N7); a long name shortens, the badge stays. */}
          <View className="flex-1 flex-row items-center gap-1">
            <Text variant="bodyStrong" className="shrink" numberOfLines={1}>
              {name}
            </Text>
            {post.author?.verified ? <VerifiedBadge size="base" /> : null}
          </View>
          <Text variant="caption">{`${date} · ${time}`}</Text>
          {isReflection ? (
            <Ionicons
              name="sparkles"
              size={13}
              color={colors.brand[500]}
              accessibilityLabel="Shared as an AI reflection"
            />
          ) : null}
          <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel="Post options">
            <Ionicons name="ellipsis-horizontal" size={18} color={colors['ink-soft']} />
          </Pressable>
        </View>

        <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined}>
          {post.mood_slugs.length ? <MoodPillGroup moods={post.mood_slugs} className="mt-2" /> : null}
          {pending ? (
            <>
              <Text variant="caption" className="mt-2" style={{ fontStyle: 'italic' }}>
                Your AI reflection is on its way. Your circle will see it once it’s ready.
              </Text>
              {onRetryReflection && post.entry_id ? (
                <Pressable
                  onPress={onRetryReflection}
                  hitSlop={6}
                  accessibilityRole="button"
                  className="mt-1 self-start"
                >
                  <Text variant="caption" className="text-brand-600">
                    Taking a while? Try again
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text variant="body" className="mt-2">
              {post.mention ? (
                <Text variant="bodyStrong" className="text-brand-600">
                  {`@${post.mention.display_name ?? 'Someone'}`}
                  {post.mention.verified ? (
                    <>
                      {' '}
                      <VerifiedBadge size="base" />
                    </>
                  ) : null}{' '}
                </Text>
              ) : null}
              {text}
            </Text>
          )}
        </Pressable>

        <View className="mt-3 flex-row items-center gap-4">
          <Pressable
            onPress={onHeart}
            disabled={!canReact || pending}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: post.liked_by_me }}
            accessibilityLabel={post.liked_by_me ? 'Unlike' : 'Like'}
            className="flex-row items-center gap-1"
            style={{ opacity: !canReact || pending ? 0.4 : 1 }}
          >
            <Ionicons
              name={post.liked_by_me ? 'heart' : 'heart-outline'}
              size={18}
              color={post.liked_by_me ? colors.danger : colors['ink-soft']}
            />
            {post.like_count > 0 ? <Text variant="caption">{post.like_count}</Text> : null}
          </Pressable>

          {canReply && !pending ? (
            <Pressable onPress={onReply} hitSlop={6} accessibilityRole="button">
              <Text variant="caption" className="text-brand-600">
                Reply
              </Text>
            </Pressable>
          ) : null}

          {onToggleReplies && post.reply_count > 0 ? (
            <Pressable
              onPress={onToggleReplies}
              hitSlop={6}
              accessibilityRole="button"
              className="flex-row items-center gap-1"
            >
              <Ionicons
                name={repliesOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.brand[500]}
              />
              <Text variant="caption" className="text-brand-600">
                {repliesOpen ? 'Hide replies' : viewRepliesLabel(post.reply_count)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
