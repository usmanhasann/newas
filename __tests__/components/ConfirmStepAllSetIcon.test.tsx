/**
 * "You're all set" (client revisions 10/14 p.11, N12): the icon is a solid purple circle with a
 * white check and nothing around it (the halo and dots are gone). It pops in (slightly smaller →
 * full size with an overshoot, fading in), then the check draws itself right after the circle
 * settles; it plays once and never loops. Reduce Motion: AllSetCheckReducedMotion.test.tsx.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ConfirmStep } from '@features/onboarding/screens/steps/ConfirmStep';
import { ALL_SET_CHECK, CHECK_LENGTH } from '@features/onboarding/allSetCheck';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('react-native-reanimated', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const calls = { timing: [], delay: [], spring: 0, repeat: 0, sequence: 0, cancel: 0 };
  return {
    __esModule: true,
    __calls: calls,
    default: {
      View: 'View',
      createAnimatedComponent: (C: unknown) =>
        function MockAnimated({ animatedProps, ...rest }: { animatedProps?: object }) {
          return mockReact.createElement(C as never, { ...rest, ...animatedProps });
        },
    },
    Easing: {
      quad: 'quad',
      back: (s: number) => `back(${s})`,
      out: (e: string) => `out(${e})`,
      inOut: (e: string) => `inOut(${e})`,
    },
    useSharedValue: (v: number) => mockReact.useRef({ value: v }).current,
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    withTiming: (to: number, cfg: object) => {
      (calls.timing as unknown[]).push({ to, ...cfg });
      return to;
    },
    withDelay: (ms: number, v: number) => {
      (calls.delay as unknown[]).push(ms);
      return v;
    },
    withSpring: (v: number) => {
      calls.spring += 1;
      return v;
    },
    withRepeat: (v: number) => {
      calls.repeat += 1;
      return v;
    },
    withSequence: (...v: number[]) => {
      calls.sequence += 1;
      return v[v.length - 1];
    },
    cancelAnimation: () => {
      calls.cancel += 1;
    },
  };
});
jest.mock('@hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('@features/subscription', () => ({
  useSubscriptionView: () => ({
    view: {
      hasAccess: true,
      isTrialing: true,
      plan: 'yearly',
      trialEndsAt: '2026-09-29T12:00:00.000Z',
    },
    isFetching: false,
    refetch: jest.fn(),
  }),
  priceWithPeriod: () => '$29.99/year',
  usePlanPrices: () => jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
  TRIAL_DAYS: 5,
}));

type Calls = {
  timing: { to: number; duration: number; easing: string }[];
  delay: number[];
  spring: number;
  repeat: number;
  sequence: number;
  cancel: number;
};
const mockCalls = (jest.requireMock('react-native-reanimated') as { __calls: Calls }).__calls;

function makeNav(saving = false): OnboardingNav {
  return {
    hydrated: true,
    data: { selected_plan: 'yearly' },
    step: 'confirm',
    steps: [],
    progress: null,
    canBack: false,
    saving,
    view: {} as OnboardingNav['view'],
    patchLocal: jest.fn(),
    persist: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
  } as unknown as OnboardingNav;
}

function nodes(root: ReactTestRendererJSON | null, type: string): ReactTestRendererJSON[] {
  if (!root) return [];
  const own = root.type === type ? [root] : [];
  const kids = (root.children ?? []).filter(
    (c): c is ReactTestRendererJSON => typeof c === 'object' && c !== null,
  );
  return own.concat(...kids.map((c) => nodes(c, type)));
}

it('shows only a solid purple circle with a white check that pops in, then draws, once', async () => {
  const utils = await render(<ConfirmStep nav={makeNav()} />);

  // The new icon replaces the old illustration (halo ring + colored dots).
  expect(utils.queryByLabelText('Success checkmark illustration')).toBeNull();
  const icon = utils.getByTestId('all-set-check');
  expect(icon.props.accessibilityLabel).toBe('Success checkmark');
  expect(utils.getByText('You’re all set.')).toBeTruthy();

  // Nothing else around it: one path (the check), no circles (halo, dots).
  const tree = utils.toJSON() as ReactTestRendererJSON;
  const iconJson = nodes(tree, 'View').find((n) => n.props.testID === 'all-set-check') ?? null;
  expect(nodes(iconJson, 'RNSVGCircle')).toHaveLength(0);
  expect(nodes(tree, 'RNSVGCircle')).toHaveLength(0);
  const paths = nodes(iconJson, 'RNSVGPath');
  expect(paths).toHaveLength(1);
  const check = paths[0].props;
  expect(check.strokeLinecap).toBe(1); // round
  expect(check.strokeLinejoin).toBe(1); // round
  expect(check.strokeWidth).toBe(8);

  // Its first frame: the circle is slightly smaller and invisible, the check not drawn yet.
  expect(icon.props.style).toEqual({
    opacity: 0,
    transform: [{ scale: ALL_SET_CHECK.circleStartScale }],
  });
  expect(check.strokeDashoffset).toBe(CHECK_LENGTH);
  expect(check.opacity).toBe(0);

  // The circle fades in and scales up with an overshoot; the check draws right after it settles.
  expect(mockCalls.timing).toEqual([
    { to: 1, duration: ALL_SET_CHECK.circleFadeMs, easing: 'out(quad)' },
    {
      to: 1,
      duration: ALL_SET_CHECK.circlePopMs,
      easing: `out(back(${ALL_SET_CHECK.circleOvershoot}))`,
    },
    { to: 1, duration: ALL_SET_CHECK.checkDrawMs, easing: 'inOut(quad)' },
  ]);
  expect(mockCalls.delay).toEqual([ALL_SET_CHECK.checkDelayMs]);
  // A one time entrance: no loop, no pulse.
  expect(mockCalls.repeat).toBe(0);
  expect(mockCalls.sequence).toBe(0);
  expect(mockCalls.spring).toBe(0);

  // Re-rendering the screen (e.g. Continue starts saving) never replays it.
  await utils.rerender(<ConfirmStep nav={makeNav(true)} />);
  expect(mockCalls.timing).toHaveLength(3);
  expect(mockCalls.delay).toHaveLength(1);
  expect(mockCalls.repeat).toBe(0);
});
