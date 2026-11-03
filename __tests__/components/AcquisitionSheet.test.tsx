import { render, fireEvent, act } from '@testing-library/react-native';
import { AcquisitionSheet } from '@features/acquisition';
import { useProfile } from '@features/profile';
import { useResolveAcquisition } from '@features/acquisition/hooks';

jest.mock('@features/profile', () => ({ useProfile: jest.fn() }));
jest.mock('@features/acquisition/hooks', () => ({ useResolveAcquisition: jest.fn() }));
// The real acquisition options (incl. the App Store logo) without loading the heavy onboarding feature.
jest.mock('@features/onboarding', () => ({
  ACQUISITIONS: [
    { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
    { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
    { value: 'app_store', label: 'App Store', icon: 'logo-apple-appstore' },
    { value: 'friends_family', label: 'Friends and Family', icon: 'people' },
    { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
  ],
}));

const profileMock = useProfile as jest.Mock;
const resolveMock = useResolveAcquisition as jest.Mock;
const record = jest.fn();
const dismiss = jest.fn();

const eligible = { onboarding_completed: true, settings: {} };
const seen = { onboarding_completed: true, settings: { acquisition_prompt_seen: true } };

beforeEach(() => {
  record.mockReset();
  dismiss.mockReset();
  resolveMock.mockReturnValue({ record: { mutate: record }, dismiss: { mutate: dismiss } });
  profileMock.mockReset();
});

const TITLE = "How'd you find us?";

describe('<AcquisitionSheet /> — one-time "How\'d you find us?" Home popup', () => {
  it('is hidden instantly, then reveals all five options (including App Store) after the delay', async () => {
    profileMock.mockReturnValue({ data: eligible });
    jest.useFakeTimers();
    try {
      const { queryByText, findByText, getByText, getByTestId } = await render(<AcquisitionSheet />);
      expect(queryByText(TITLE)).toBeNull(); // not instant

      await act(async () => {
        jest.advanceTimersByTime(2600);
      });

      expect(await findByText(TITLE)).toBeTruthy();
      ['Instagram', 'TikTok', 'App Store', 'Friends and Family', 'Other'].forEach((label) =>
        expect(getByText(label)).toBeTruthy(),
      );

      // Tapping the dimmed area outside dismisses (records nothing).
      fireEvent.press(getByTestId('acquisition-backdrop', { includeHiddenElements: true }));
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(record).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('records the chosen source and closes immediately when an option is tapped', async () => {
    profileMock.mockReturnValue({ data: eligible });
    jest.useFakeTimers();
    try {
      const { findByText, getByText, queryByText } = await render(<AcquisitionSheet />);
      await act(async () => {
        jest.advanceTimersByTime(2600);
      });
      await findByText(TITLE);

      await act(async () => {
        fireEvent.press(getByText('Instagram'));
      });
      expect(record).toHaveBeenCalledWith('instagram');
      expect(dismiss).not.toHaveBeenCalled();
      expect(queryByText(TITLE)).toBeNull(); // closes right away, no confirmation
    } finally {
      jest.useRealTimers();
    }
  });

  it('dismisses without recording when Skip is tapped', async () => {
    profileMock.mockReturnValue({ data: eligible });
    jest.useFakeTimers();
    try {
      const { findByText, getByText } = await render(<AcquisitionSheet />);
      await act(async () => {
        jest.advanceTimersByTime(2600);
      });
      await findByText(TITLE);

      fireEvent.press(getByText('Skip'));
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(record).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never appears once the prompt has already been seen', async () => {
    profileMock.mockReturnValue({ data: seen });
    jest.useFakeTimers();
    try {
      const { queryByText } = await render(<AcquisitionSheet />);
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(queryByText(TITLE)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
