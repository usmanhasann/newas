/**
 * The re-prompt card's showing rules: engaged users only, only when notifications can't
 * currently be delivered, and at most ONCE per app session (a fresh launch resets it —
 * that's the client's "close and reopen" rule, modelled by in-memory session state).
 *
 * Session behaviour is asserted through the store rather than by unmounting and re-rendering:
 * the store IS the mechanism, so checking it directly says what we mean, and a stale mounted
 * tree can't quietly turn a real failure into a passing "nothing rendered".
 */
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NotificationNudgeCard } from '@features/notifications/components/NotificationNudgeCard';
import { useNotificationNudgeStore } from '@store/notificationNudge';

const mockStatsRef: { current: Record<string, number> | undefined } = {
  current: undefined,
};
const mockUpdateMutate = jest.fn();
const mockGetPerm = jest.fn(() => Promise.resolve('denied'));
const mockRequestPerm = jest.fn(() => Promise.resolve('denied'));

jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: mockStatsRef.current }),
}));
jest.mock('@features/notifications/hooks', () => ({
  useUpdateNotificationPrefs: () => ({ mutate: mockUpdateMutate }),
}));
jest.mock('@features/notifications/reminders', () => ({
  getNotificationPermission: () => mockGetPerm(),
  requestNotificationPermission: () => mockRequestPerm(),
  canDeliver: (s: string) => s === 'granted' || s === 'provisional',
}));
const HEADLINE = 'Keep the habit going?';
const ENGAGED = { entries_count: 5, distinct_days: 3 };

// Spy on the real module the component imports, rather than mocking an internal RN path —
// a path mock that misses would make the "does not open Settings" case pass for free.
let openSettingsSpy: jest.SpiedFunction<typeof Linking.openSettings>;

beforeEach(() => {
  jest.clearAllMocks();
  openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockGetPerm.mockResolvedValue('denied');
  mockRequestPerm.mockResolvedValue('denied');
  mockStatsRef.current = ENGAGED;
  useNotificationNudgeStore.getState().reset(); // a fresh app launch
});

afterEach(() => {
  openSettingsSpy.mockRestore();
});

describe('<NotificationNudgeCard /> — when the re-prompt is raised', () => {
  it('appears for an engaged user whose notifications are blocked', async () => {
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());
  });

  it('stays hidden for a user who has not hit the engagement bar', async () => {
    mockStatsRef.current = { entries_count: 5, distinct_days: 1 }; // all in one sitting
    const { queryByText } = await render(<NotificationNudgeCard />);
    await act(async () => {});
    expect(queryByText(HEADLINE)).toBeNull();
  });

  it('stays hidden when notifications already work — nothing to ask for', async () => {
    mockGetPerm.mockResolvedValue('granted');
    const { queryByText } = await render(<NotificationNudgeCard />);
    await act(async () => {});
    expect(queryByText(HEADLINE)).toBeNull();
  });

  it('claims the session the moment it is raised', async () => {
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());
    expect(useNotificationNudgeStore.getState().shownThisSession).toBe(true);
  });

  it('stays quiet for the rest of the session once the user has answered it', async () => {
    // Raised, then answered (accepted or dismissed) — returning to Home must not re-raise it.
    useNotificationNudgeStore.getState().raise();
    useNotificationNudgeStore.getState().hide();
    const { queryByText } = await render(<NotificationNudgeCard />);
    await act(async () => {});
    expect(queryByText(HEADLINE)).toBeNull();
  });

  it('shows the SAME unanswered prompt when returning to Home, without raising a second', async () => {
    useNotificationNudgeStore.getState().raise(); // raised earlier this session, not yet answered
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());
    expect(useNotificationNudgeStore.getState().shownThisSession).toBe(true);
  });

  it('shows again after the app is closed and reopened', async () => {
    useNotificationNudgeStore.getState().raise();
    useNotificationNudgeStore.getState().hide();
    useNotificationNudgeStore.getState().reset(); // relaunch clears in-memory session state
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());
  });
});

describe('<NotificationNudgeCard /> — acting on it', () => {
  it('"Not now" dismisses it without touching any preference', async () => {
    const { getByText, queryByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Not now'));
    });
    expect(queryByText(HEADLINE)).toBeNull();
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('"Turn on reminders" saves the preference and, when hard-denied, opens Settings', async () => {
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Turn on reminders'));
    });

    // Recorded even though iOS refused — so granting later in Settings schedules on return.
    expect(mockUpdateMutate).toHaveBeenCalledWith({ journaling_reminder: true });
    await waitFor(() => expect(openSettingsSpy).toHaveBeenCalledTimes(1));
  });

  it('does not bounce the user to Settings when the OS grants permission', async () => {
    mockRequestPerm.mockResolvedValue('granted');
    const { getByText } = await render(<NotificationNudgeCard />);
    await waitFor(() => expect(getByText(HEADLINE)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Turn on reminders'));
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith({ journaling_reminder: true });
    expect(openSettingsSpy).not.toHaveBeenCalled();
  });
});
