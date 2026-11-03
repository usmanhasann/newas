/**
 * Client 10/14 p.11-12 (O6) on the real screen "The shift you're working toward": "Right now:
 * Stressed most days" (it showed the noun, "Stress most days"), and "With LYSM" in the same form
 * ("Feeling calmer", not the instruction "Feel calmer").
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ShiftStep } from '@features/onboarding/screens/steps/ShiftStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));

it('reads "Right now: Stressed most days" and "With LYSM: Feeling calmer"', async () => {
  const nav = {
    data: { frequency: 'most_days', goal: ['calmer'] },
    canBack: true,
    goBack: jest.fn(),
    goNext: jest.fn(),
    progress: null,
    saving: false,
  } as unknown as OnboardingNav;
  const utils = await render(<ShiftStep nav={nav} />);
  expect(utils.getByText('Right now')).toBeTruthy();
  expect(utils.getByText('Stressed most days')).toBeTruthy();
  expect(utils.queryByText('Stress most days')).toBeNull();
  expect(utils.getByText('With LYSM')).toBeTruthy();
  expect(utils.getByText('Feeling calmer')).toBeTruthy();
  expect(utils.queryByText('Feel calmer')).toBeNull();
});
