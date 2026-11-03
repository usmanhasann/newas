/**
 * Client 10/14 p.32 (bug screenshot = this Sign In screen): tapping "Continue with Apple" showed a
 * spinner in place of the Google button's text and logo. Now the spinner is on the Apple button
 * itself (the custom Apple pill from the N6 redesign can show one; Apple's native button could
 * not), and Google and Email are only grayed out with their normal text and icons.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SignInScreen } from '@features/auth/screens/SignInScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  isUserCanceledSignIn: () => false,
  // Apple's sheet stays open (never resolves) so the in-progress state can be inspected.
  signInExistingWithApple: jest.fn(() => new Promise<void>(() => {})),
  signInExistingWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));
const social = jest.requireMock('@features/auth/social') as {
  signInExistingWithApple: jest.Mock;
  signInExistingWithGoogle: jest.Mock;
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

it('tapping Apple: spinner on Apple only; Google and Email grayed out but keep text and icons', async () => {
  const utils = await render(<SignInScreen />);
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Apple' }),
  );
  await waitFor(() => expect(social.signInExistingWithApple).toHaveBeenCalledTimes(1));

  const apple = await waitFor(() => {
    const b = utils.getByRole('button', { name: 'Continue with Apple' });
    expect(b.props.accessibilityState).toMatchObject({ busy: true });
    return b;
  });
  // Exactly one spinner on the screen, inside the Apple button; Apple keeps its title, not dimmed.
  expect(
    JSON.stringify(utils.toJSON()).match(/"type":"ActivityIndicator"/g) ?? [],
  ).toHaveLength(1);
  expect(findAll(apple, (n) => n.type === 'ActivityIndicator')).toHaveLength(1);
  expect(within(apple).getByText('Continue with Apple')).toBeTruthy();
  expect(String(apple.props.className)).not.toContain('opacity-50');

  const google = utils.getByRole('button', { name: 'Continue with Google' });
  const email = utils.getByRole('button', { name: 'Continue with Email' });
  expect(google.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  expect(email.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  expect(String(google.props.className)).toContain('opacity-50');
  expect(String(email.props.className)).toContain('opacity-50');
  expect(utils.getByText('Continue with Google')).toBeTruthy();
  expect(
    utils.getByTestId('google-g-logo', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(utils.getByText('Continue with Email')).toBeTruthy();

  // Nothing else can start while Apple runs.
  await fireEvent.press(google);
  expect(social.signInExistingWithGoogle).not.toHaveBeenCalled();
});
