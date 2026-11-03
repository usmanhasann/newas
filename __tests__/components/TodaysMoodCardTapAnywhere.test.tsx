/**
 * Client 10/14 p.6: a tap ANYWHERE on the Today's Moods card (the header, the streak badge, the card
 * background, the mood row's empty space) opens New Entry with no mood chosen, while a tap on a mood
 * keeps opening it with that mood, never both. userEvent.press walks the same responder path a finger
 * does (the deepest touchable takes the touch), so a mood tap that also reached the card would fail
 * here. A horizontal scroll of the mood row opens nothing. One render per file.
 */
import { render, userEvent } from '@testing-library/react-native';
import { TodaysMoodCard } from '@features/journal/components/TodaysMoodCard';

/** A rendered host element (RNTL's own host instance type). */
type TestInstance = Awaited<ReturnType<typeof render>>['container'];

const mockToday = ['calm'];
const mockStreak = { state: 'normal', streak: 5 };
jest.mock('@features/journal/hooks', () => ({
  useTodayMoods: () => mockToday,
  useStreakIndicator: () => mockStreak,
}));

/** The mood row's horizontal ScrollView (host), found from one of its moods. */
function moodRow(mood: TestInstance): TestInstance {
  let node: TestInstance | null = mood;
  while (node && node.type !== 'RCTScrollView') node = node.parent;
  if (!node) throw new Error('mood row ScrollView not found');
  return node;
}

it('opens a blank New Entry from anywhere on the card; a mood opens with just that mood', async () => {
  const user = userEvent.setup();
  const onPickMood = jest.fn();
  const onPressCard = jest.fn();
  const screen = await render(
    <TodaysMoodCard onPickMood={onPickMood} onPressCard={onPressCard} />,
  );

  await user.press(screen.getByText('Today’s Moods')); // the header label
  expect(onPressCard).toHaveBeenCalledTimes(1);

  await user.press(screen.getByLabelText('5 day streak')); // the streak badge (header, top right)
  expect(onPressCard).toHaveBeenCalledTimes(2);

  await user.press(screen.getByTestId('todays-moods-card')); // the card background
  expect(onPressCard).toHaveBeenCalledTimes(3);

  const row = moodRow(screen.getByLabelText('Happy'));
  await user.press(row); // empty space in the mood row, between and around the circles
  expect(onPressCard).toHaveBeenCalledTimes(4);
  expect(onPressCard.mock.calls.every((args) => args.length === 0)).toBe(true); // no mood chosen
  expect(onPickMood).not.toHaveBeenCalled();

  // A mood tap: exactly as before, that mood only, and the card does not also fire.
  await user.press(screen.getByLabelText('Happy'));
  expect(onPickMood).toHaveBeenCalledTimes(1);
  expect(onPickMood).toHaveBeenCalledWith('happy');
  // An already highlighted mood (logged today) too.
  await user.press(screen.getByLabelText('Calm'));
  expect(onPickMood).toHaveBeenCalledTimes(2);
  expect(onPickMood).toHaveBeenLastCalledWith('calm');
  expect(onPressCard).toHaveBeenCalledTimes(4);

  // Scrolling the mood row sideways opens nothing.
  await user.scrollTo(row, { x: 240 });
  expect(onPressCard).toHaveBeenCalledTimes(4);
  expect(onPickMood).toHaveBeenCalledTimes(2);
});
