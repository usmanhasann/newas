/**
 * The crisis AI check can finish after the person already left the screen (e.g. tapped Skip while
 * it ran, then started typing on the next screen). It must then do nothing: no stray keyboard
 * close on the next screen's input.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Keyboard, Pressable, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useCrisisScan } from '@features/crisis/useCrisisScan';

let finishConfirm: (v: boolean) => void = () => {};
jest.mock('@features/crisis/hooks', () => ({ useCrisisKeywords: () => ({ data: [{ id: 'k1' }] }) }));
jest.mock('@features/crisis/matcher', () => ({ detectCrisis: () => ({ id: 'k1' }) }));
jest.mock('@features/crisis/api', () => ({
  confirmCrisis: () =>
    new Promise<boolean>((resolve) => {
      finishConfirm = resolve;
    }),
}));

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

it('does nothing when the check finishes after the screen is gone', async () => {
  const utils = await render(<Harness />);
  await fireEvent.press(utils.getByLabelText('run'));
  await utils.unmount();
  finishConfirm(true);
  await new Promise((r) => setTimeout(r, 0));
  expect(dismiss).not.toHaveBeenCalled();
});
