import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { fetchVerifiedCircleOwners, type VerifiedOwner } from './ownersApi';

const NONE: ReadonlyMap<string, VerifiedOwner> = new Map();

/**
 * The verified owners of these Public circles (Discover's cards and its Join popup), as circle id →
 * owner. Read again every time a screen showing them opens (never kept as a stale copy), so a badge
 * an admin turns off is gone the next time the list shows (client 10/14 p.5: "right away").
 * Empty while loading or when none of them is verified.
 */
export function useVerifiedCircleOwners(
  circleIds: readonly string[],
): ReadonlyMap<string, VerifiedOwner> {
  const user = useCurrentUser();
  const ids = [...new Set(circleIds)].sort();
  const q = useQuery({
    queryKey: ['circles', 'verified-owners', ids],
    queryFn: () => fetchVerifiedCircleOwners(ids),
    enabled: !!user?.id && ids.length > 0,
    staleTime: 0,
  });
  return q.data ?? NONE;
}
