import { Card, Text } from '@components';
import { cn } from '@utils/cn';
import type { CircleStanding } from '@app-types/database';
import { standingNotice } from '../postingLogic';

/** Explains why the composer / reply box is missing when moderation standing blocks posting. */
export function StandingNotice({
  standing,
  className,
}: {
  standing: CircleStanding;
  className?: string;
}) {
  const message = standingNotice(standing);
  if (!message) return null;
  return (
    <Card elevated={false} className={cn('bg-surface-muted', className)}>
      <Text variant="bodyMuted">{message}</Text>
    </Card>
  );
}
