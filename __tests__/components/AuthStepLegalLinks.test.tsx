/**
 * "Save your progress", client 10/14 p.32: under the buttons, in small gray text, "By continuing,
 * you agree to our Terms and Privacy Policy." where "Terms" and "Privacy Policy" are purple
 * (underlined, per the mockup) links that open those pages; the final period stays gray.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@lib/legal';

const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve({ type: 'dismiss' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
  openAuthSessionAsync: () => Promise.resolve({ type: 'cancel' }),
  maybeCompleteAuthSession: () => {},
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => new Promise<void>(() => {})),
  signInWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));

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

it('legal line: exact text, small gray, purple underlined links that open Terms and Privacy Policy', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  const line = await utils.findByText(
    'By continuing, you agree to our Terms and Privacy Policy.',
  );
  const split = (v: unknown) => String(v).split(' ');

  // Small, centred, gray; the final period is the line's own (gray) text, not part of a link.
  expect(split(line.props.className)).toEqual(
    expect.arrayContaining(['text-sm', 'text-center', 'text-ink-soft']),
  );
  const children = line.props.children as unknown[];
  expect(children[children.length - 1]).toBe('.');

  // It sits under the buttons (after the Email button in the screen's order).
  const json = JSON.stringify(utils.toJSON());
  expect(json.indexOf('By continuing')).toBeGreaterThan(
    json.indexOf('Continue with Email'),
  );

  const terms = utils.getByText('Terms');
  const privacy = utils.getByText('Privacy Policy');
  for (const link of [terms, privacy]) {
    expect(link.props.accessibilityRole).toBe('link');
    expect(split(link.props.className)).toEqual(
      expect.arrayContaining(['text-brand-600', 'underline', 'text-sm']),
    );
  }

  await fireEvent.press(terms);
  await waitFor(() => expect(mockOpenBrowser).toHaveBeenCalledWith(TERMS_URL));
  await fireEvent.press(privacy);
  await waitFor(() =>
    expect(mockOpenBrowser).toHaveBeenLastCalledWith(PRIVACY_POLICY_URL),
  );
  expect(PRIVACY_POLICY_URL).toBe('https://lysm.app/privacy-policy');
  expect(TERMS_URL).toMatch(/^https:\/\//);
});
