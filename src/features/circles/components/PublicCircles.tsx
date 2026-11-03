/**
 * Public-circle browsing, shared by the Join a Circle page (top 5) and the full Discover Circles
 * list: the member-count-sorted directory, the circle cards, and the Join / Not now popup.
 */
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, Text } from '@components';
import { colors } from '@theme';
import { toast } from '@store/toast';
import type { Circle } from '@app-types/database';
import { CircleArchivedError } from '../api';
import { useJoinCircle, useMyCircles, usePublicCircles } from '../hooks';
import { useVerifiedCircleOwners } from '../ownersHooks';
import { sortPublicCirclesByMembers } from '../postingLogic';
import { CircleOwnerByline } from './CircleOwnerByline';

/** Public circles, most members first, plus which of them the user already belongs to. */
export function usePublicCircleDirectory() {
  const publicQ = usePublicCircles();
  const { data: myCircles = [] } = useMyCircles();
  return {
    list: sortPublicCirclesByMembers(publicQ.data ?? []),
    joinedIds: new Set(myCircles.map((c) => c.id)),
    isLoading: publicQ.isLoading,
    /** Couldn't load (and nothing to show from before): say so, never "No public circles yet". */
    failed: publicQ.isError && !publicQ.data,
    retrying: publicQ.isFetching,
    retry: () => void publicQ.refetch(),
  };
}

/** The Join / Not now popup's state: pick a circle → confirm → join → `onJoined(circleId)`. */
export function useJoinPublicCircle(onJoined: (circleId: string) => void) {
  const join = useJoinCircle();
  const publicQ = usePublicCircles();
  const [selected, setSelected] = useState<Circle | null>(null);

  const confirm = () => {
    if (!selected) return;
    const id = selected.id;
    join.mutate(id, {
      onSuccess: () => {
        setSelected(null);
        onJoined(id);
      },
      onError: (e) => {
        if (e instanceof CircleArchivedError) {
          // Archived since the list loaded (client 10/14 p.23: no one new can join, and it leaves
          // Discover): say why, close the popup and reload the list so it drops off.
          toast.error(e.message);
          setSelected(null);
          void publicQ.refetch();
          return;
        }
        toast.error('Couldn’t join. Please try again.');
      },
    });
  };

  return {
    selected,
    select: setSelected,
    close: () => setSelected(null),
    confirm,
    joining: join.isPending,
  };
}

/** Circle cards: a circle you're in opens directly; any other asks to join first. */
export function PublicCircleCards({
  circles,
  joinedIds,
  onOpenCircle,
  onPickToJoin,
}: {
  circles: Circle[];
  joinedIds: Set<string>;
  onOpenCircle: (circleId: string) => void;
  onPickToJoin: (circle: Circle) => void;
}) {
  // Client 10/14 p.5 (N7.18): a circle owned by a verified person names them, badge after the name.
  const owners = useVerifiedCircleOwners(circles.map((c) => c.id));
  return (
    <>
      {circles.map((c) => {
        const joined = joinedIds.has(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => (joined ? onOpenCircle(c.id) : onPickToJoin(c))}
            accessibilityRole="button"
          >
            <Card className="mb-3">
              <View className="flex-row items-center gap-2">
                <Text variant="bodyStrong" className="flex-1" numberOfLines={1}>
                  {c.name}
                </Text>
                {joined ? (
                  <Text variant="caption" className="text-brand-600">
                    Joined
                  </Text>
                ) : null}
              </View>
              <CircleOwnerByline name={owners.get(c.id)?.name} className="mt-0.5" />
              <Text variant="bodyMuted" className="mt-1" numberOfLines={2}>
                {c.description ?? 'A public circle.'}
              </Text>
              <Text variant="caption" className="mt-2">
                {c.member_count} {c.member_count === 1 ? 'member' : 'members'}
                {c.archived_at ? ' · archived' : ''}
              </Text>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}

export function NoPublicCirclesCard() {
  return (
    <Card>
      <Text variant="bodyStrong">No public circles yet</Text>
      <Text variant="bodyMuted" className="mt-1">
        Create one from the Circles tab to get things started.
      </Text>
    </Card>
  );
}

export function JoinPublicCircleModal({
  circle,
  joining,
  onJoin,
  onClose,
}: {
  circle: Circle | null;
  joining: boolean;
  onJoin: () => void;
  onClose: () => void;
}) {
  const owners = useVerifiedCircleOwners(circle ? [circle.id] : []);
  return (
    <Modal visible={!!circle} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Dismiss"
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: colors.overlay }}
      >
        <Pressable onPress={() => {}} className="w-full rounded-2xl bg-surface p-6">
          <Text variant="h3" className="text-center">
            {circle?.name}
          </Text>
          <CircleOwnerByline
            name={circle ? owners.get(circle.id)?.name : null}
            className="mt-1 text-center"
          />
          {circle?.description ? (
            <Text variant="bodyMuted" className="mt-2 text-center">
              {circle.description}
            </Text>
          ) : null}
          <Text variant="caption" className="mt-3 text-center">
            {circle?.member_count} {circle?.member_count === 1 ? 'member' : 'members'}
          </Text>
          {/* "Join" in brand purple, "Not now" in grey (per spec). */}
          <Button title="Join" className="mt-5" loading={joining} onPress={onJoin} />
          <Button title="Not now" variant="ghost" className="mt-2" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
