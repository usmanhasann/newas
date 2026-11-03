/**
 * The crisis resources sheet opens while the person is typing (first check-in, journal, Circles).
 * The keyboard is closed first so it can't stay up over the sheet and hide the help; what they
 * wrote is kept (client 10/14 p.7: the keyboard closes when leaving the text box).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Keyboard, Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useCrisisScan } from '@features/crisis/useCrisisScan';

jest.mock('@features/crisis/hooks', () => ({ useCrisisKeywords: () => ({ data: [{ id: 'k1' }] }) }));
jest.mock('@features/crisis/matcher', () => ({ detectCrisis: () => ({ id: 'k1' }) }));
jest.mock('@features/crisis/api', () => ({ confirmCrisis: () => Promise.resolve(true) }));

const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

function Harness() {
  const { scan, sheet } = useCrisisScan();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="run" onPress={() => void scan('x')}>
        <Text>run</Text>
      </Pressable>
      {sheet}
    </>
  );
}

it('closes the keyboard as the crisis sheet opens', async () => {
  const utils = await render(<Harness />);
  expect(dismiss).not.toHaveBeenCalled();
  await fireEvent.press(utils.getByLabelText('run'));
  await waitFor(() => expect(utils.getByText(/You.re not alone in this/)).toBeTruthy());
  expect(dismiss).toHaveBeenCalledTimes(1);
});
