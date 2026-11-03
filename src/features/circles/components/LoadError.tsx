import { Button, Card, Text } from '@components';

/**
 * Shown where a circles list or post couldn't load, instead of an empty state that would read as
 * "nothing here" (or "not available") when it's really a connection problem.
 */
export function LoadError({
  title,
  retrying,
  onRetry,
  className,
}: {
  title: string;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="bodyMuted" className="mt-1">
        Check your connection and try again.
      </Text>
      <Button
        title="Try again"
        variant="secondary"
        size="sm"
        fullWidth={false}
        className="mt-3 self-start"
        loading={retrying}
        onPress={onRetry}
      />
    </Card>
  );
}
