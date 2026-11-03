import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { usePendingInviteStore } from '@store/pendingInvite';
import { toast } from '@store/toast';
import { notifyEvent } from '@features/notifications';
import type { CircleType, MemberStatus } from '@app-types/database';
import * as api from './api';
import type { CircleNotificationPrefs } from './notificationSwitches';
import { applyCircleChange } from './myCirclesOrder';

export const circleKeys = {
  my: (uid?: string) => ['circles', 'my', uid] as const,
  detail: (id: string) => ['circles', 'detail', id] as const,
  members: (id: string) => ['circles', 'members', id] as const,
  notificationPrefs: (circleId: string, uid?: string) =>
    ['circles', 'notificationPrefs', circleId, uid] as const,
};

/**
 * Every circle the user is in, in Your Circles order (most recent activity first, archived last).
 * `live` (the Circles tab): keep the order up to date while it's open (client 10/14 p.2): a post or
 * reply in any of the circles moves it to the top, archiving moves it to the bottom, being let into
 * a circle adds it, and coming back to the app reloads the list (changes may have been missed).
 */
export function useMyCircles(opts: { live?: boolean } = {}) {
  const u = useCurrentUser();
  const qc = useQueryClient();
  const uid = u?.id;
  const query = useQuery({
    queryKey: circleKeys.my(uid),
    queryFn: () => api.fetchMyCircles(uid!),
    enabled: !!uid,
  });

  const live = !!opts.live && !!uid;
  // Listen again only when the set of circles changes (not on every reorder).
  const idsKey = (query.data ?? [])
    .map((c) => c.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!live || !uid) return;
    const key = circleKeys.my(uid);
    const reload = () => void qc.invalidateQueries({ queryKey: key });
    return api.subscribeToMyCircles(uid, idsKey ? idsKey.split(',') : [], {
      onCircleChange: (change) =>
        qc.setQueryData<api.MyCircle[]>(key, (old) => (old ? applyCircleChange(old, change) : old)),
      onMembershipChange: reload,
      onResubscribed: reload,
    });
  }, [live, uid, idsKey, qc]);

  useEffect(() => {
    if (!live || !uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void qc.invalidateQueries({ queryKey: circleKeys.my(uid) });
    });
    return () => sub.remove();
  }, [live, uid, qc]);

  return query;
}

export function useCircle(id: string) {
  return useQuery({
    queryKey: circleKeys.detail(id),
    queryFn: () => api.fetchCircle(id),
    enabled: !!id,
  });
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: circleKeys.members(id),
    queryFn: () => api.fetchMembers(id),
    enabled: !!id,
  });
}

export function useCreateCircle() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      name: string;
      type: CircleType;
      description?: string | null;
    }) => api.createCircle(u!.id, args.name, args.type, args.description),
    onSuccess: () => qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) }),
  });
}

/** Discovery — all Public Circles, sorted by member count (highest first). */
export function usePublicCircles() {
  return useQuery({
    queryKey: ['circles', 'public'],
    queryFn: api.fetchPublicCircles,
    staleTime: 30_000,
  });
}

/** Open-join a Public Circle (instant). Its owner is told (send-push combines joins close together). */
export function useJoinCircle() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (circleId: string) => api.joinCircle(circleId, u!.id),
    onSuccess: (_r, circleId) => {
      qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) });
      qc.invalidateQueries({ queryKey: ['circles', 'public'] });
      void api.notifyCircleEvent({ type: 'member_joined', circle_id: circleId });
    },
  });
}

/** Ban a user from a Circle (Public creator power) — records the ban + removes membership. */
export function useBanUser(circleId: string) {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.banFromCircle(circleId, userId, u!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: circleKeys.members(circleId) }),
  });
}

/** This person's notification switches for one circle (every switch ON until they change it). */
export function useCircleNotificationPrefs(circleId: string) {
  const u = useCurrentUser();
  return useQuery({
    queryKey: circleKeys.notificationPrefs(circleId, u?.id),
    queryFn: () => api.fetchCircleNotificationPrefs(circleId, u!.id),
    enabled: !!circleId && !!u?.id,
  });
}

/** Flip switches for one circle — shown immediately, then confirmed from the server. */
export function useUpdateCircleNotificationPrefs(circleId: string) {
  const u = useCurrentUser();
  const qc = useQueryClient();
  const key = circleKeys.notificationPrefs(circleId, u?.id);
  return useMutation({
    mutationFn: (patch: Partial<CircleNotificationPrefs>) =>
      api.updateCircleNotificationPrefs(circleId, u!.id, patch),
    onMutate: (patch) => {
      qc.setQueryData<CircleNotificationPrefs>(key, (old) => (old ? { ...old, ...patch } : old));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Archive (or unarchive) a circle you own, Public or Private. Its page, Your Circles (it moves to the
 * bottom, or back up) and Discover refresh, and everyone else in it is told (client 10/14 p.24).
 */
function useSetCircleArchived(archived: boolean) {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (circleId: string) =>
      archived ? api.archiveCircle(circleId) : api.unarchiveCircle(circleId),
    onSuccess: (_r, circleId) => {
      qc.invalidateQueries({ queryKey: circleKeys.detail(circleId) });
      qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) });
      qc.invalidateQueries({ queryKey: ['circles', 'public'] });
      void api.notifyCircleEvent({
        type: archived ? 'circle_archived' : 'circle_unarchived',
        circle_id: circleId,
      });
    },
  });
}

/** Archive a circle you own. */
export function useArchiveCircle() {
  return useSetCircleArchived(true);
}

/** Unarchive a circle you own: posting, replies and (Public) Discover come back. */
export function useUnarchiveCircle() {
  return useSetCircleArchived(false);
}

/**
 * Delete a circle you own (Private at any size; Public under 5 members). Its lists refresh; the
 * screens showing it navigate away themselves.
 */
export function useDeleteCircle() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (circleId: string) => api.deleteCircle(circleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) });
      qc.invalidateQueries({ queryKey: ['circles', 'public'] });
    },
  });
}

export function useUpdateCircle(circleId: string) {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: api.CirclePatch) => api.updateCircle(circleId, patch),
    onSuccess: (updated) => {
      qc.setQueryData(circleKeys.detail(circleId), updated);
      qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) });
    },
  });
}

export function useJoinByCode() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.joinByCode(code),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) });
      // A Private code joins as 'requested' → notify the owner of the pending request.
      if (result?.status === 'requested') {
        void notifyEvent({ type: 'join_request', circle_id: result.circleId });
      } else if (result?.status === 'approved') {
        // A Public code joins straight away → its owner is told (send-push ignores a repeat use of
        // the code by someone already in it).
        void api.notifyCircleEvent({ type: 'member_joined', circle_id: result.circleId });
      }
    },
  });
}

/**
 * Redeems an invite code typed while creating an account, once that account is signed in, and says
 * what happened, with the same outcomes and wording as the Join a Circle page: a Public circle is
 * joined; a Private circle gets a request (and its owner is told); a code that matches nothing is
 * said plainly. Mounted once at the app root.
 */
export function usePendingInviteRedeem(): void {
  const code = usePendingInviteStore((s) => s.code);
  const setCode = usePendingInviteStore((s) => s.set);
  const user = useCurrentUser();
  const join = useJoinByCode();
  const running = useRef(false);

  useEffect(() => {
    if (!code || !user?.id || running.current) return;
    running.current = true;
    setCode(null);
    join
      .mutateAsync(code)
      .then((result) => {
        if (!result) {
          toast.error('That invite code didn’t match a circle. You can join one anytime from the Circles tab.');
        } else if (result.status === 'approved') {
          toast.success(`You joined “${result.name}.”`);
        } else {
          toast.success(`Request sent to join “${result.name}.” You’ll get in once the owner approves.`);
        }
      })
      .catch((e: unknown) => {
        toast.error(
          e instanceof api.CircleArchivedError
            ? e.message
            : 'We couldn’t use your invite code right now. You can join from the Circles tab.',
        );
      })
      .finally(() => {
        running.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user?.id]);
}

export function useSetMemberStatus(circleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; status: MemberStatus }) =>
      api.setMemberStatus(args.memberId, args.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: circleKeys.members(circleId) }),
  });
}

export function useRemoveMember(circleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.removeMember(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: circleKeys.members(circleId) }),
  });
}

export function useLeaveCircle() {
  const u = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (circleId: string) => api.leaveCircle(circleId, u!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: circleKeys.my(u?.id) }),
  });
}

export function useInviteByEmail() {
  return useMutation({
    mutationFn: (args: {
      circleId: string;
      email: string;
      name?: string | null;
    }) => api.inviteByEmail(args.circleId, args.email, { name: args.name }),
  });
}
