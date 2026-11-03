/**
 * Sign In ("Welcome back") redesign, client 10/14 p.31-32 + mockup: same layout as "Save your
 * progress": a bare dark chevron at the top left and no progress bar; the real LYSM app icon (not
 * the purple heart circle), the serif headline and the gray subtext; the same three pills in the
 * order Apple, Google, Email ("Continue with Email", not "Sign in with Email"), Apple now the same
 * custom black pill as the other two; and "Don’t have an account? Get started" under them, "Get
 * started" bold purple and not underlined.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '@features/auth/screens/SignInScreen';
import { colors, spacing } from '@theme';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  isUserCanceledSignIn: () => false,
  signInExistingWithApple: jest.fn(() => new Promise<void>(() => {})),
  signInExistingWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));
const social = jest.requireMock('@features/auth/social') as {
  signInExistingWithApple: jest.Mock;
};

type Node = {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[] | null;
};
function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
    return out;
  }
  const n = node as Node;
  if (pred(n)) out.push(n);
  (n.children ?? []).forEach((c) => findAll(c, pred, out));
  return out;
}

it('Sign In matches the client mockup and shares the sign-up layout', async () => {
  const utils = await render(<SignInScreen />);
  const apple = await utils.findByRole('button', { name: 'Continue with Apple' });
  const tree = utils.toJSON();
  const split = (v: unknown) => String(v).split(' ');
  const classes = (text: string) => split(utils.getByText(text).props.className);

  // Back arrow: a bare dark chevron, top left; no progress bar.
  const back = utils.getByRole('button', { name: 'Go back' });
  const chevron = findAll(back, (n) => n.type === 'Icon')[0]!;
  expect(chevron.props.name).toBe('chevron-back');
  expect(chevron.props.color).toBe(colors.ink);
  expect(String(back.props.className ?? '')).not.toMatch(/bg-|rounded/);
  expect(findAll(tree, (n) => n.props.accessibilityRole === 'progressbar')).toHaveLength(
    0,
  );

  // The real app icon replaces the purple heart circle.
  const image = findAll(utils.getByTestId('app-icon'), (n) => n.type === 'Image')[0]!;
  expect(image.props.source).toBe(require('../../assets/icon.png'));
  expect(utils.queryByText('🤍')).toBeNull();

  // Headline + subtext: exact text, same styles as sign-up.
  expect(classes('Welcome back')).toEqual(
    expect.arrayContaining(['font-serif-bold', 'text-headline', 'text-center']),
  );
  expect(classes('Sign in to pick up right where you left off.')).toEqual(
    expect.arrayContaining(['text-md', 'text-center', 'text-ink-soft']),
  );

  // Same three pills, new order, "Continue with Email". Apple is the custom pill (spinner-capable),
  // not Apple's native button.
  const order = utils
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel)
    .filter((l) => typeof l === 'string' && l.startsWith('Continue with'));
  expect(order).toEqual([
    'Continue with Apple',
    'Continue with Google',
    'Continue with Email',
  ]);
  expect(utils.queryByText('Sign in with Email')).toBeNull();
  expect(utils.queryByTestId('apple-continue-button')).toBeNull();
  for (const name of order) {
    const button = utils.getByRole('button', { name: name as string });
    expect(split(button.props.className)).toEqual(
      expect.arrayContaining(['rounded-full', 'border']),
    );
    expect(button.props.style).toEqual(expect.objectContaining({ height: spacing[14] }));
  }
  expect(split(apple.props.className)).toContain('bg-black');
  expect(
    utils.getByTestId('google-g-logo', { includeHiddenElements: true }),
  ).toBeTruthy();
  const mail = findAll(tree, (n) => n.type === 'Icon' && n.props.name === 'mail-outline');
  expect(mail[0]!.props.color).toBe(colors.brand[600]);

  // Footer: one line, gray question + bold purple "Get started", not underlined, no comma.
  expect(classes('Don’t have an account?')).toEqual(
    expect.arrayContaining(['text-ink-soft']),
  );
  const getStarted = classes('Get started');
  expect(getStarted).toEqual(
    expect.arrayContaining(['text-brand-600', 'font-sans-semibold']),
  );
  expect(getStarted).not.toContain('underline');
  expect(utils.queryByText(/Get started,/)).toBeNull();
  // No legal line on Sign In (that line belongs to sign-up).
  expect(utils.queryByText(/By continuing/)).toBeNull();

  await fireEvent.press(apple);
  await waitFor(() => expect(social.signInExistingWithApple).toHaveBeenCalledTimes(1));
});
