/**
 * The shared Jest stand-in for react-native-reanimated (jest.setup.js) covers what the "You're all
 * set" icon uses: useAnimatedProps, Easing.back/out/inOut/quad and ReduceMotion. With motion on, the
 * entrance builds its timings and the icon renders through the GLOBAL mock (no local reanimated mock
 * here), so any screen showing it (ConfirmStep) can be rendered in tests.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { Easing, ReduceMotion } from 'react-native-reanimated';
import { AllSetCheck } from '@features/onboarding/components/AllSetCheck';

jest.mock('@hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

it('renders the icon with motion on through the shared reanimated mock', async () => {
  // The pieces the icon needs exist and behave as identities (useAnimatedProps runs in the render).
  expect(Easing.back(1.4)(0.5)).toBe(0.5);
  expect(Easing.out(Easing.back(1.4))(0.25)).toBe(0.25);
  expect(ReduceMotion.System).toBe('system');

  const utils = await render(<AllSetCheck />);
  expect(utils.getByTestId('all-set-check')).toBeTruthy();
  expect(utils.getByLabelText('Success checkmark')).toBeTruthy();
});
