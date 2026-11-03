/**
 * Join a Circle — the two ways to join a circle you're not in yet, on one page (opened from the
 * Circles tab's "Discover circles" row), laid out like Home: an "Invite Code" card (like
 * "Today's Moods"), then a "Discover Circles" header whose arrow opens the full public list (like
 * "Recent Entries →"), with the most popular public circles listed directly below it.
 * Joining — by code or by browsing — works exactly as it did on the two separate screens.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingScreen, Screen, Text } from '@components';
import { colors } from '@theme';
import type { CirclesStackParamList } from '@/navigation/types';
import { JoinByCodeCard } from '../components/JoinByCodeCard';
import {
  JoinPublicCircleModal,
  NoPublicCirclesCard,
  PublicCircleCards,
  useJoinPublicCircle,
  usePublicCircleDirectory,
} from '../components/PublicCircles';
import { LoadError } from '../components/LoadError';

type Props = NativeStackScreenProps<CirclesStackParamList, 'JoinCircle'>;

/** How many of the most popular public circles are listed directly on this page. */
export const TOP_PUBLIC_CIRCLES = 5;

export function JoinCircleScreen({ navigation }: Props) {
  const { list, joinedIds, isLoading, failed, retrying, retry } = usePublicCircleDirectory();
  const top = list.slice(0, TOP_PUBLIC_CIRCLES);
  const openCircle = (circleId: string) =>
    navigation.navigate('CircleDetail', { circleId });
  const joinFlow = useJoinPublicCircle(openCircle);

  return (
    <Screen padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Join a Circle</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-10 pt-2"
      >
        <JoinByCodeCard
          onJoined={(circleId) => navigation.replace('CircleDetail', { circleId })}
          onRequested={() => navigation.goBack()}
          onNeedsVerification={(code) =>
            navigation.navigate('VerifyEmailToJoin', { code })
          }
        />

        <View className="mb-3 mt-6 flex-row items-center justify-between">
          <Text variant="section">Discover Circles</Text>
          {top.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate('Discover')}
              accessibilityRole="button"
              accessibilityLabel="View all public circles"
              hitSlop={12}
              className="h-11 w-11 flex-row items-center justify-end"
            >
              <Ionicons name="arrow-forward" size={20} color={colors.brand[500]} />
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : failed ? (
          <LoadError title="We couldn’t load public circles" retrying={retrying} onRetry={retry} />
        ) : top.length === 0 ? (
          <NoPublicCirclesCard />
        ) : (
          <PublicCircleCards
            circles={top}
            joinedIds={joinedIds}
            onOpenCircle={openCircle}
            onPickToJoin={joinFlow.select}
          />
        )}
      </ScrollView>

      <JoinPublicCircleModal
        circle={joinFlow.selected}
        joining={joinFlow.joining}
        onJoin={joinFlow.confirm}
        onClose={joinFlow.close}
      />
    </Screen>
  );
}
