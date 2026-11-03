import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, LoadingScreen } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import { firstName } from '@utils/name';
import { useProfile } from '@features/profile';
import type { CircleType } from '@app-types/database';
import type { CirclesStackParamList } from '@/navigation/types';
import { useMyCircles } from '../hooks';
import type { MyCircle } from '../api';
import { circleRoleLine, circlesPageTitle } from '../postingLogic';
import { LoadError } from '../components/LoadError';

type Props = NativeStackScreenProps<CirclesStackParamList, 'MyCircles'>;

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Client's text for the "No circles yet" card (revisions 2026-10-14), word for word. */
const NO_CIRCLES_BODY =
  'Create a circle and invite people, or join one with a code. Once you’re in one, you can share your mood along with your AI reflection or written entry, and post with others in the circle.';

/**
 * The colored type icon on a YOUR CIRCLES card (client mockup 2026-10-14): Public = light green
 * circle with a dark green outline globe, Private = light purple circle with a dark purple outline
 * lock. Class names stay literal so Tailwind sees them.
 */
const TYPE_ICON: Record<
  CircleType,
  { icon: IconName; circleClass: string; color: string }
> = {
  public: {
    icon: 'globe-outline',
    circleClass: 'bg-circle-public-bg',
    color: colors.circle['public-ink'],
  },
  private: {
    icon: 'lock-closed-outline',
    circleClass: 'bg-circle-private-bg',
    color: colors.circle['private-ink'],
  },
};

/**
 * Archived circles always sit below every active circle; each group keeps the order it came in
 * (most recent activity first: the server's order, kept live by useMyCircles).
 */
function archivedLast<T extends { archived_at: string | null }>(
  circles: readonly T[],
): T[] {
  return [
    ...circles.filter((c) => !c.archived_at),
    ...circles.filter((c) => !!c.archived_at),
  ];
}

function ActionCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: IconName;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card padded={false} className="mb-3 px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={icon} size={22} color={colors.brand[500]} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="caption" className="mt-0.5">
              {desc}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors['ink-faint']} />
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * One YOUR CIRCLES card: colored type icon, name over the role line, chevron. Same padding as the
 * Create/Discover cards so the icons' left edges line up. An archived circle's whole card fades,
 * icon included.
 */
function CircleRow({ circle, onPress }: { circle: MyCircle; onPress: () => void }) {
  const look = TYPE_ICON[circle.type];
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card
        padded={false}
        className={cn('mb-3 px-4 py-4', circle.archived_at ? 'opacity-60' : null)}
      >
        <View className="flex-row items-center gap-3">
          <View
            className={cn(
              'h-11.5 w-11.5 items-center justify-center rounded-full',
              look.circleClass,
            )}
          >
            <Ionicons name={look.icon} size={22} color={look.color} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong">{circle.name}</Text>
            <Text variant="caption" className="mt-0.5">
              {circleRoleLine(circle)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors['ink-faint']} />
        </View>
      </Card>
    </Pressable>
  );
}

export function MyCirclesScreen({ navigation }: Props) {
  // Live: the order follows new posts, replies and archiving while the Circles tab is open.
  const circlesQ = useMyCircles({ live: true });
  const circles = archivedLast(circlesQ.data ?? []);
  const { data: profile } = useProfile();

  return (
    <Screen scroll contentClassName="py-6">
      <Text variant="h1">{circlesPageTitle(firstName(profile?.display_name))}</Text>
      <Text variant="bodyMuted" className="mt-1">
        Share how you feel with people who care.
      </Text>

      <View className="mt-6">
        <ActionCard
          icon="add-circle-outline"
          title="Create a circle"
          desc="Start a public or private circle and invite people"
          onPress={() => navigation.navigate('CreateCircle')}
        />
        {/* Joining by code and browsing public circles share one page (Join a Circle). */}
        <ActionCard
          icon="compass-outline"
          title="Discover circles"
          desc="Have an invite code, or browse to find a circle to join."
          onPress={() => navigation.navigate('JoinCircle')}
        />
      </View>

      <Text variant="section" className="mb-3 mt-6">
        Your Circles
      </Text>

      {circlesQ.isLoading ? (
        <LoadingScreen />
      ) : circlesQ.isError && !circlesQ.data ? (
        // Couldn't load (and nothing to show from before): say so, never "No circles yet".
        <LoadError
          title="We couldn’t load your circles"
          retrying={circlesQ.isFetching}
          onRetry={() => void circlesQ.refetch()}
        />
      ) : circles.length === 0 ? (
        <Card>
          <Text variant="bodyStrong">No circles yet</Text>
          <Text variant="bodyMuted" className="mt-1">
            {NO_CIRCLES_BODY}
          </Text>
        </Card>
      ) : (
        circles.map((c) => (
          <CircleRow
            key={c.id}
            circle={c}
            onPress={() => navigation.navigate('CircleDetail', { circleId: c.id })}
          />
        ))
      )}
    </Screen>
  );
}
