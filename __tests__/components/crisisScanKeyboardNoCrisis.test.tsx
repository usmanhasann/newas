/**
 * The crisis sheet closes the keyboard only when the sheet actually opens: a keyword hit the AI
 * rejects ("this workout is killing me") must not close the keyboard mid-sentence; when the AI is
 * unavailable the sheet opens (fail-open) and the keyboard closes.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Keyboard, Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useCrisisScan } from '@features/crisis/useCrisisScan';

const mockDetect = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@features/crisis/hooks', () => ({ useCrisisKeywords: () => ({ data: [{ id: 'k1' }] }) }));
jest.mock('@features/crisis/matcher', () => ({ detectCrisis: (...a: unknown[]) => mockDetect(...a) }));
jest.mock('@features/crisis/api', () => ({ confirmCrisis: (...a: unknown[]) => mockConfirm(...a) }));

const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

function Harness() {
  const { scan, sheet } = useCrisisScan();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="benign" onPress={() => void scan('a')}>
        <Text>benign</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="unconfirmed" onPress={() => void scan('b')}>
        <Text>unconfirmed</Text>
      </Pressable>
      {sheet}
    </>
  );
}

it('keeps the keyboard for a rejected hit, closes it when the sheet opens (AI unavailable)', async () => {
  const utils = await render(<Harness />);

  mockDetect.mockReturnValueOnce({ id: 'k1' });
  mockConfirm.mockResolvedValueOnce(false);
  await fireEvent.press(utils.getByLabelText('benign'));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
  expect(utils.queryByText(/You.re not alone in this/)).toBeNull();
  expect(dismiss).not.toHaveBeenCalled();

  mockDetect.mockReturnValueOnce({ id: 'k2' });
  mockConfirm.mockRejectedValueOnce(new Error('AI down'));
  await fireEvent.press(utils.getByLabelText('unconfirmed'));
  await waitFor(() => expect(utils.getByText(/You.re not alone in this/)).toBeTruthy());
  expect(dismiss).toHaveBeenCalledTimes(1);
});
