/**
 * "Save your progress" (onboarding AuthStep) redesign, client 10/14 p.31-32 + mockup: progress bar
 * kept at the top (no back arrow on this step); the real LYSM app icon (about 90px, rounded square,
 * purple glow) with the large bold serif headline on one line and the smaller gray subtext under
 * it; at the bottom three pills of one size and shape in the order Apple, Google, Email, each icon
 * right next to its title and both centred; Apple black with white logo and text, Google and Email
 * white with a thin light warm-gray border and dark text, the colour G and a purple envelope.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';
import { borderRadius, colors, fontSize, shadow, spacing } from '@theme';

// AuthStep sends a person who already has an account to Sign In (a sibling screen).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  // Non-resolving so the busy handler suspends and no trailing state update escapes the test.
  signInWithApple: jest.fn(() => new Promise<void>(() => {})),
  signInWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));
const auth = jest.requireMock('@features/auth') as { signInWithApple: jest.Mock };

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
const iconsNamed = (tree: unknown, name: string) =>
  findAll(tree, (n) => n.type === 'Icon' && n.props.name === name);
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flat))
    : ((style as Record<string, unknown>) ?? {});

// The real flow on this step: back is disabled, the progress line shows 14 of 15.
const nav = {
  hydrated: true,
  data: {},
  step: 'auth',
  steps: [],
  progress: { index: 14, total: 15 },
  canBack: false,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(),
  goNext: jest.fn(() => new Promise<void>(() => {})),
  goBack: jest.fn(),
} as OnboardingNav;

it('Save your progress matches the client mockup', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  const apple = await utils.findByRole('button', { name: 'Continue with Apple' });
  const google = utils.getByRole('button', { name: 'Continue with Google' });
  const email = utils.getByRole('button', { name: 'Continue with Email' });
  const tree = utils.toJSON();
  const split = (v: unknown) => String(v).split(' ');
  const classes = (text: string | RegExp) => split(utils.getByText(text).props.className);

  // Progress bar kept at the top; no back arrow on this step.
  const bars = findAll(tree, (n) => n.props.accessibilityRole === 'progressbar');
  expect(bars).toHaveLength(1);
  expect(bars[0]!.props.accessibilityValue).toMatchObject({ now: 14, max: 15 });
  expect(utils.queryByRole('button', { name: 'Go back' })).toBeNull();

  // The real app icon file, about 90px, rounded square, soft purple glow; no heart circle.
  const icon = utils.getByTestId('app-icon');
  const image = findAll(icon, (n) => n.type === 'Image')[0]!;
  expect(image.props.source).toBe(require('../../assets/icon.png'));
  expect(flat(image.props.style)).toMatchObject({
    width: 88,
    height: 88,
    borderRadius: borderRadius.lg,
  });
  expect(spacing[22]).toBe(88);
  expect(flat(icon.props.style)).toMatchObject({ ...shadow.fab, width: 88, height: 88 });
  expect(utils.queryByText('🤍')).toBeNull();

  // Headline: exact text, large bold serif, centred, one line. Subtext: exact, smaller, gray.
  expect(classes('Save your progress')).toEqual(
    expect.arrayContaining(['font-serif-bold', 'text-headline', 'text-center', 'w-full']),
  );
  expect(fontSize.headline).toBe('36px');
  expect(utils.getByText('Save your progress').props.numberOfLines).toBe(1);
  expect(
    classes('Create your account so your plan and entries are always here for you.'),
  ).toEqual(expect.arrayContaining(['text-md', 'text-center', 'text-ink-soft']));

  // Order: Apple, Google, Email.
  const order = utils
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel)
    .filter((l) => typeof l === 'string' && l.startsWith('Continue with'));
  expect(order).toEqual([
    'Continue with Apple',
    'Continue with Google',
    'Continue with Email',
  ]);

  // One size and shape: full-width pills about 58px tall; icon right next to the title, centred.
  for (const button of [apple, google, email]) {
    expect(split(button.props.className)).toEqual(
      expect.arrayContaining([
        'w-full',
        'rounded-full',
        'border',
        'justify-center',
        'gap-2.5',
      ]),
    );
    expect(button.props.style).toEqual(expect.objectContaining({ height: spacing[14] }));
  }
  for (const title of [
    'Continue with Apple',
    'Continue with Google',
    'Continue with Email',
  ]) {
    expect(classes(title)).toEqual(
      expect.arrayContaining(['text-lg', 'font-sans-semibold']),
    );
    expect(utils.getByText(title).props.numberOfLines).toBe(1);
  }

  // Apple: solid black, white logo and white title.
  expect(split(apple.props.className)).toEqual(
    expect.arrayContaining(['bg-black', 'border-black']),
  );
  expect(classes('Continue with Apple')).toContain('text-white');
  const appleLogo = iconsNamed(tree, 'logo-apple');
  expect(appleLogo).toHaveLength(1);
  expect(appleLogo[0]!.props.color).toBe(colors.white);

  // Google: white, thin warm-gray border, dark title, the official colour G.
  expect(split(google.props.className)).toEqual(
    expect.arrayContaining(['bg-surface', 'border-line-strong']),
  );
  expect(classes('Continue with Google')).toContain('text-ink');
  expect(
    utils.getByTestId('google-g-logo', { includeHiddenElements: true }),
  ).toBeTruthy();

  // Email: white, same border, DARK title (not purple), purple outline envelope.
  expect(split(email.props.className)).toEqual(
    expect.arrayContaining(['bg-surface', 'border-line-strong']),
  );
  expect(classes('Continue with Email')).toContain('text-ink');
  expect(classes('Continue with Email')).not.toContain('text-brand-600');
  const mail = iconsNamed(tree, 'mail-outline');
  expect(mail).toHaveLength(1);
  expect(mail[0]!.props.color).toBe(colors.brand[600]);

  // Legal line under the buttons.
  expect(
    utils.getByText('By continuing, you agree to our Terms and Privacy Policy.'),
  ).toBeTruthy();

  // Apple still signs in.
  await fireEvent.press(apple);
  await waitFor(() => expect(auth.signInWithApple).toHaveBeenCalledTimes(1));
});
