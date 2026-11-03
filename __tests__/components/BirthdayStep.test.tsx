import { render, fireEvent, act } from '@testing-library/react-native';
import { BirthdayStep } from '@features/onboarding/screens/steps/BirthdayStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// Capture the picker's onChange so a test can simulate the user scrolling the wheel. The factory
// only references a `mock`-prefixed variable and renders null (no RN imports → no NativeWind interop).
const mockPickerOnChange: { current: ((e: unknown, d?: Date) => void) | null } = { current: null };
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: { onChange?: (e: unknown, d?: Date) => void }) => {
    mockPickerOnChange.current = props.onChange ?? null;
    return null;
  },
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step: 'birthday',
    steps: [],
    progress: null,
    canBack: true,
    saving: false,
    view: {} as OnboardingNav['view'],
    patchLocal: jest.fn(),
    persist: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

describe('<BirthdayStep /> — date wheel with an 18+ age gate', () => {
  it('carries a previously-saved 18+ birthday forward unchanged (no age warning)', async () => {
    const nav = makeNav({ data: { date_of_birth: '1995-02-18' } });
    const { getByText, queryByText } = await render(<BirthdayStep nav={nav} />);

    // The picker itself shows the date — it is never echoed as a caption underneath it.
    expect(queryByText('February 18, 1995')).toBeNull();
    expect(queryByText(/You must be 18 years or older/)).toBeNull();
    expect(getByText('This helps us personalize your experience.')).toBeTruthy();
    expect(getByText(/This information won.t be shown publicly/)).toBeTruthy();

    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledWith({ date_of_birth: '1995-02-18' });
  });

  it('blocks a pre-saved under-18 birthday: shows the message and disables Continue', async () => {
    const nav = makeNav({ data: { date_of_birth: '2015-06-15' } });
    const { getByText } = await render(<BirthdayStep nav={nav} />);

    expect(getByText(/You must be 18 years or older to use LYSM/)).toBeTruthy();
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).not.toHaveBeenCalled();
  });

  it('engages the gate when the PICKER reports an under-18 date without a type:"set" event', async () => {
    const nav = makeNav(); // default ~25y → starts eligible
    const { getByText, queryByText } = await render(<BirthdayStep nav={nav} />);

    // Starts eligible: no warning yet.
    expect(queryByText(/You must be 18 years or older/)).toBeNull();

    // Simulate scrolling the wheel to a 2015 birthday — the iOS inline picker often fires
    // onChange WITHOUT type:'set', which the old guard dropped.
    await act(async () => {
      mockPickerOnChange.current?.({ type: undefined }, new Date(2015, 5, 15));
    });

    // The picked date must register → the gate engages and Continue is blocked.
    expect(getByText(/You must be 18 years or older to use LYSM/)).toBeTruthy();
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).not.toHaveBeenCalled();
  });

  it('is advanceable by default (the default age is 18+) and persists a well-formed YYYY-MM-DD', async () => {
    const nav = makeNav();
    const { getByText } = await render(<BirthdayStep nav={nav} />);

    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledTimes(1);
    const patch = (nav.goNext as jest.Mock).mock.calls[0][0] as { date_of_birth: string };
    expect(patch.date_of_birth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
