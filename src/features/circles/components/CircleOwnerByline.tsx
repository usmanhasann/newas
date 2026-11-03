import { Text, VerifiedBadge } from '@components';

/**
 * "Created by [Name]" with the verified badge right after the name (client revisions 10/14 p.5,
 * N7), for a circle whose owner is VERIFIED: on Discover's cards and Join popup (Public circles),
 * and in the header of a circle they own. Shows nothing without a name.
 */
export function CircleOwnerByline({
  name,
  className,
}: {
  /** The verified owner's display name. */
  name: string | null | undefined;
  className?: string;
}) {
  const shown = name?.trim();
  if (!shown) return null;
  return (
    <Text
      variant="caption"
      className={className}
      accessibilityLabel={`Created by ${shown}, verified`}
      testID="circle-owner-byline"
    >
      {`Created by ${shown} `}
      <VerifiedBadge size="xs" />
    </Text>
  );
}
