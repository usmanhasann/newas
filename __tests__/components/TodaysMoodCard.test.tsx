import { render, fireEvent } from '@testing-library/react-native';
import { TodaysMoodCard } from '@features/journal/components/TodaysMoodCard';

// The card reads today's logged moods via useTodayMoods; drive it directly (the hook + query wiring
// is covered elsewhere). Returns first-selected order, e.g. ['tired','calm']. The header's streak
// badge reads useStreakIndicator — driven here too (its logic is covered by streakStatus.test).
const todayMoods: { value: string[] } = { value: [] };
const mockStreak: { state: 'hidden' | 'normal' | 'urgent'; streak: number } = {
  state: 'hidden',
  streak: 0,
};
jest.mock('@features/journal/hooks', () => ({
  useTodayMoods: () => todayMoods.value,
  useStreakIndicator: () => mockStreak,
}));

beforeEach(() => {
  todayMoods.value = [];
  mockStreak.state = 'hidden';
  mockStreak.streak = 0;
});

describe('<TodaysMoodCard /> (Home quick mood shortcut §3)', () => {
  it('shows the mood icon picker and reports the tapped mood (→ preselect in New Entry)', async () => {
    const onPickMood = jest.fn();
    const { getByText, getByLabelText } = await render(
      <TodaysMoodCard onPickMood={onPickMood} onPressCard={jest.fn()} />,
    );
    expect(getByText('Today’s Moods')).toBeTruthy();
    await fireEvent.press(getByLabelText('Happy'));
    expect(onPickMood).toHaveBeenCalledWith('happy');
  });

  it('every mood is tappable — there is no per-user/per-day limit anymore (§1.2)', async () => {
    const onPickMood = jest.fn();
    const { getByLabelText } = await render(
      <TodaysMoodCard onPickMood={onPickMood} onPressCard={jest.fn()} />,
    );
    await fireEvent.press(getByLabelText('Angry'));
    expect(onPickMood).toHaveBeenCalledWith('angry');
  });

  it("floats today's logged moods to the left, marked selected, in first-selected order", async () => {
    todayMoods.value = ['tired', 'calm'];
    const { getAllByRole, getByLabelText } = await render(
      <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
    );

    const labels = getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.slice(0, 2)).toEqual(['Tired', 'Calm']); // selected float to the left, in order
    expect(labels).toHaveLength(10); // all moods still present

    expect(getByLabelText('Tired').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Calm').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Happy').props.accessibilityState.selected).toBe(false);
  });

  it('tapping an already-highlighted mood still opens New Entry (ring/checkmark are visual only)', async () => {
    todayMoods.value = ['tired'];
    const onPickMood = jest.fn();
    const { getByLabelText } = await render(
      <TodaysMoodCard onPickMood={onPickMood} onPressCard={jest.fn()} />,
    );
    await fireEvent.press(getByLabelText('Tired')); // Tired is already highlighted
    expect(onPickMood).toHaveBeenCalledWith('tired');
  });
});

describe('<TodaysMoodCard /> — streak indicator (header, top-right)', () => {
  it('shows no streak badge for a user with no active streak', async () => {
    mockStreak.state = 'hidden';
    const { queryByLabelText } = await render(
      <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
    );
    expect(queryByLabelText(/day streak/)).toBeNull();
  });

  it('normal state: flame + count, no "before midnight" urgency', async () => {
    mockStreak.state = 'normal';
    mockStreak.streak = 5;
    const { getByLabelText, getByText, queryByLabelText } = await render(
      <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
    );
    expect(getByLabelText('5 day streak')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
    expect(queryByLabelText(/before midnight/)).toBeNull();
  });

  it('urgent state: signals the streak is about to be lost', async () => {
    mockStreak.state = 'urgent';
    mockStreak.streak = 7;
    const { getByLabelText, getByText } = await render(
      <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
    );
    expect(getByLabelText(/7 day streak\. Journal before midnight/)).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });
});
