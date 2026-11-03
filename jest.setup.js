/**
 * Jest setup (setupFilesAfterEnv). Mocks native-only modules so component tests can
 * render under jest-expo without an Expo/native runtime.
 *
 * RNTL 14's render() is ASYNC (React 19 concurrent) — component tests must
 * `await render(...)`. These mocks only make the import chains resolvable.
 */

// React 19 throws "not configured to support act(...)" on async state updates unless
// this is set; RNTL drives renders through act, so mark this an act environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Client env: harmless test values so the supabase client constructs quietly.
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

// Native storage used by the supabase client / session persistence.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: () => Promise.resolve() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));

// Reanimated boots the native worklets runtime on import (absent under Jest). Its own
// /mock re-imports the real index, so use a self-contained stub. Return string host
// tags (not React elements) so NativeWind's Babel transform doesn't inject css-interop
// references into this hoisted jest.mock factory.
jest.mock('react-native-reanimated', () => {
  const Animated = {
    View: 'View',
    Text: 'Text',
    ScrollView: 'ScrollView',
    createAnimatedComponent: (c) => c,
  };
  // Layout/entering animations (e.g. FadeInDown) are chainable builders in real reanimated
  // (`FadeInDown.duration(320)`). Stub each as a chainable no-op so any builder call returns
  // itself; the string-tag Animated.View ignores the resulting `entering` value under Jest.
  const enteringBuilder = () => {
    const b = {};
    const chain = () => b;
    [
      'duration', 'delay', 'springify', 'damping', 'mass', 'stiffness', 'build',
      'withInitialValues', 'easing', 'withCallback', 'randomDelay', 'reduceMotion', 'getDuration',
    ].forEach((m) => {
      b[m] = chain;
    });
    return b;
  };
  return {
    __esModule: true,
    default: Animated,
    View: 'View',
    Text: 'Text',
    ScrollView: 'ScrollView',
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn) => ({ value: fn() }),
    // The props worklet runs once with the current shared values (e.g. AllSetCheck's check stroke).
    useAnimatedProps: (fn) => fn(),
    withSpring: (v) => v,
    withTiming: (v) => v,
    withDelay: (_d, v) => v,
    withRepeat: (v) => v,
    withSequence: (v) => v,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: {
      linear: (x) => x,
      ease: (x) => x,
      quad: (x) => x,
      cubic: (x) => x,
      in: (x) => x,
      inOut: (x) => x,
      out: (x) => x,
      bezier: () => (x) => x,
      back: () => (x) => x,
    },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    FadeIn: enteringBuilder(),
    FadeOut: enteringBuilder(),
    FadeInDown: enteringBuilder(),
    FadeInUp: enteringBuilder(),
    FadeOutDown: enteringBuilder(),
    Layout: enteringBuilder(),
    LinearTransition: enteringBuilder(),
  };
});

// @expo/vector-icons lazily pulls in expo-font → expo-asset (not resolvable here).
// Replace every icon set with a plain host-component string tag (returned as a string,
// not a React element, to avoid the css-interop injection in this factory).
jest.mock('@expo/vector-icons', () => new Proxy({}, { get: () => 'Icon' }));

// expo-font's loader requires expo-asset (not installed). Component tests don't need
// real fonts, so stub the font modules.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: () => Promise.resolve(),
  isLoaded: () => true,
}));
jest.mock(
  '@expo-google-fonts/playfair-display',
  () => new Proxy({}, { get: (_t, k) => String(k) }),
);
jest.mock('@expo-google-fonts/inter', () => new Proxy({}, { get: (_t, k) => String(k) }));

// iOS home-screen widget storage (App Group) — no native runtime under Jest.
jest.mock('@bacons/apple-targets', () => {
  const ExtensionStorage = jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    get: jest.fn(() => null),
    remove: jest.fn(),
  }));
  ExtensionStorage.reloadWidget = jest.fn();
  ExtensionStorage.reloadControls = jest.fn();
  return { ExtensionStorage };
});

// Native Apple sign-in + the OAuth browser (Google) — no native runtime under Jest.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: () => Promise.resolve({ identityToken: 'test-token', fullName: null }),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
  AppleAuthenticationButton: 'AppleAuthenticationButton',
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: () => Promise.resolve({ type: 'cancel' }),
  maybeCompleteAuthSession: () => {},
}));

// Native Google Sign-In — the real module needs a linked native module. social.ts only
// dynamically imports this when configured, so tests never load it for real; the mock keeps
// any incidental import resolvable (a canceled sign-in by default).
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: () => Promise.resolve(true),
    signIn: () => Promise.resolve({ type: 'cancelled' }),
  },
  isSuccessResponse: (r) => r?.type === 'success',
}));

// In-app purchases (expo-iap) — a native module. No store under Jest: no products, no purchases,
// nothing to restore. Tests that exercise purchases mock it themselves.
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(() => Promise.resolve(true)),
  endConnection: jest.fn(() => Promise.resolve(true)),
  fetchProducts: jest.fn(() => Promise.resolve([])),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve(null)),
  finishTransaction: jest.fn(() => Promise.resolve()),
  deepLinkToSubscriptions: jest.fn(() => Promise.resolve()),
  isEligibleForIntroOfferIOS: jest.fn(() => Promise.resolve(false)),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  isUserCancelledError: (e) => e?.code === 'user-cancelled',
}));

// Native date/time picker (@react-native-community/datetimepicker) — native module; render
// nothing under Jest and stub the imperative Android API so the import chain resolves.
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

// expo-linking's createURL() runs at module load in auth/api.ts and needs the Expo
// manifest (absent under Jest). Stub the surface used across feature barrels.
jest.mock('expo-linking', () => ({
  createURL: (path = '') => `innercircle://${String(path).replace(/^\//, '')}`,
  parse: (url) => {
    const [base, query = ''] = String(url).split('?');
    const path = base.replace(/^[a-z0-9-]+:\/\//i, '').replace(/\/$/, '');
    const queryParams = {};
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      queryParams[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return { path, queryParams, hostname: null, scheme: null };
  },
  addEventListener: () => ({ remove: () => {} }),
  getInitialURL: () => Promise.resolve(null),
  useURL: () => null,
}));
