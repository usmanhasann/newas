/**
 * "You're all set" icon (client revisions 10/14 p.11, N12) with Reduce Motion on: no entrance
 * animation at all; the finished icon (full size, fully visible, check fully drawn) shows at once
 * and holds still. One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { AllSetCheck } from '@features/onboarding/components/AllSetCheck';

jest.mock('react-native-reanimated', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const calls = { animations: 0 };
  const count = (v: unknown) => {
    calls.animations += 1;
    return v;
  };
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
    Easing: { quad: 'quad', back: () => 'back', out: () => 'out', inOut: () => 'inOut' },
    useSharedValue: (v: number) => mockReact.useRef({ value: v }).current,
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    withTiming: count,
    withDelay: (_ms: number, v: unknown) => count(v),
    withSpring: count,
    withRepeat: count,
    withSequence: count,
    cancelAnimation: () => {},
  };
});
jest.mock('@hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const mockCalls = (
  jest.requireMock('react-native-reanimated') as { __calls: { animations: number } }
).__calls;

function find(root: ReactTestRendererJSON | null, type: string): ReactTestRendererJSON[] {
  if (!root) return [];
  const own = root.type === type ? [root] : [];
  const kids = (root.children ?? []).filter(
    (c): c is ReactTestRendererJSON => typeof c === 'object' && c !== null,
  );
  return own.concat(...kids.map((c) => find(c, type)));
}

it('skips the entrance and shows the finished icon at once', async () => {
  const utils = await render(<AllSetCheck />);
  // Re-render so the (mocked) animated style / props read the values the effect settled on.
  await utils.rerender(<AllSetCheck />);

  expect(mockCalls.animations).toBe(0);

  const icon = utils.getByTestId('all-set-check');
  expect(icon.props.style).toEqual({ opacity: 1, transform: [{ scale: 1 }] });

  const tree = utils.toJSON() as ReactTestRendererJSON;
  const [check] = find(tree, 'RNSVGPath');
  // No dash offset left: react-native-svg passes a 0 offset on as "none" (null).
  expect(check.props.strokeDashoffset ?? 0).toBe(0);
  expect(check.props.opacity).toBe(1);

  // The circle is the Continue button's purple (bg-brand-500): a flat round fill, 144px (h-36 /
  // w-36 token), with no border or shadow.
  const circle = find(tree, 'View').find((v) =>
    String(v.props.className ?? '')
      .split(/\s+/)
      .includes('bg-brand-500'),
  );
  expect(circle).toBeTruthy();
  const classes = String(circle?.props.className).split(/\s+/);
  expect(classes).toEqual(expect.arrayContaining(['h-36', 'w-36', 'rounded-full']));
  expect(classes.some((c) => c.startsWith('border') || c.startsWith('shadow'))).toBe(false);
  expect(circle?.props.style).toBeUndefined();
});
