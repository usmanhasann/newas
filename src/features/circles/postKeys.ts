/**
 * Query keys for circle posts (used by postsHooks, and read by the live updates in circleLive).
 * The feed keys' shape is parsed by liveFeed.feedKeyInfo: keep the two in step.
 */
export const postKeys = {
  all: ['circlePosts'] as const,
  post: (id: string) => ['circlePosts', 'post', id] as const,
  replies: (parentId: string) => ['circlePosts', 'replies', parentId] as const,
  feed: (circleId: string) => ['circlePosts', 'feed', circleId] as const,
  entryShares: (entryId: string) => ['circlePosts', 'entryShares', entryId] as const,
};
