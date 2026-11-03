import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingScreen, Screen, Text } from '@components';
import { colors } from '@theme';
import type { CirclesStackParamList } from '@/navigation/types';
import {
  JoinPublicCircleModal,
  NoPublicCirclesCard,
  PublicCircleCards,
  useJoinPublicCircle,
  usePublicCircleDirectory,
} from '../components/PublicCircles';
import { LoadError } from '../components/LoadError';

type Props = NativeStackScreenProps<CirclesStackParamList, 'Discover'>;

/** The full list of Public Circles (most members first) — opened from Join a Circle's arrow. */
export function DiscoveryScreen({ navigation }: Props) {
  const { list, joinedIds, isLoading, failed, retrying, retry } = usePublicCircleDirectory();
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
        <Text variant="h3">Discover Circles</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {isLoading ? (
          <LoadingScreen />
        ) : failed ? (
          <LoadError title="We couldn’t load public circles" retrying={retrying} onRetry={retry} />
        ) : list.length === 0 ? (
          <NoPublicCirclesCard />
        ) : (
          <PublicCircleCards
            circles={list}
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
