/**
 * Journal entries are KEYWORDS ONLY (client 10/14 p.36, user decision): the phone checks the text
 * against the crisis keyword list and never asks an AI (detect-crisis) about it. Once the entry is
 * saved with the words, the crisis resources pop-up opens (the keyboard closes first), and what the
 * screen does next waits until the person closes it.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Keyboard, Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEntryCrisisCheck } from '@features/crisis/useEntryCrisisCheck';

const mockConfirm = jest.fn();
const mockThen = jest.fn();

jest.mock('@features/crisis/hooks', () => ({
  useCrisisKeywords: () => ({
    data: [
      {
        id: 'k1',
        phrase: 'kill myself',
        match_type: 'contains',
        severity: 'critical',
        is_active: true,
      },
    ],
  }),
}));
jest.mock('@features/crisis/api', () => ({ confirmCrisis: (t: string) => mockConfirm(t) }));

const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

function Harness() {
  const { hasCrisisWords, showSupport, sheet } = useEntryCrisisCheck();
  return (
    <>
      <Text testID="flagged">{String(hasCrisisWords('I want to KILL MYSELF'))}</Text>
      <Text testID="calm">{String(hasCrisisWords('A calm day by the river'))}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="saved" onPress={() => showSupport(mockThen)}>
        <Text>saved</Text>
      </Pressable>
      {sheet}
    </>
  );
}

it('checks keywords on the phone only, and opens support once the entry is saved', async () => {
  const utils = await render(<Harness />);
  expect(utils.getByTestId('flagged').props.children).toBe('true');
  expect(utils.getByTestId('calm').props.children).toBe('false');
  // Writing never opens anything and never asks an AI.
  expect(utils.queryByText('You’re not alone in this')).toBeNull();
  expect(mockConfirm).not.toHaveBeenCalled();

  await fireEvent.press(utils.getByLabelText('saved'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(utils.getByText('You’re not alone in this')).toBeTruthy());
  expect(mockThen).not.toHaveBeenCalled(); // the screen waits for the person

  await fireEvent.press(utils.getByTestId('crisis-resources-close'));
  expect(mockThen).toHaveBeenCalledTimes(1);
  expect(mockConfirm).not.toHaveBeenCalled();
});
