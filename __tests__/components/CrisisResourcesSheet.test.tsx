import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { CrisisResourcesSheet } from '@features/crisis';

/**
 * One render per test on purpose: RN's Modal doesn't reliably mount children across several
 * sequential Modal instances in a single jest file, so all of the sheet's behavior (content,
 * link actions, and dismiss-on-outside-tap) is verified from a single mounted instance.
 */
describe('<CrisisResourcesSheet /> — proactive, dismissible crisis resources popup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders all three resources, opens the right links, and dismisses on an outside tap', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const onClose = jest.fn();
    const { getByText, getByTestId } = await render(
      <CrisisResourcesSheet visible onClose={onClose} />,
    );

    // Content: headline, all three resources, and the closing line.
    expect(getByText('You’re not alone in this')).toBeTruthy();
    expect(getByText('988 Suicide & Crisis Lifeline')).toBeTruthy();
    expect(getByText('Crisis Text Line')).toBeTruthy();
    expect(getByText('Outside the US')).toBeTruthy();
    expect(getByText(/any level of struggle/)).toBeTruthy();

    // Each action opens the correct tel/sms/url.
    await fireEvent.press(getByText('Call 988'));
    await fireEvent.press(getByText('Text 988'));
    await fireEvent.press(getByText('Text HOME to 741741'));
    await fireEvent.press(getByText('findahelpline.com'));
    expect(spy).toHaveBeenCalledWith('tel:988');
    expect(spy).toHaveBeenCalledWith('sms:988');
    expect(spy).toHaveBeenCalledWith('sms:741741');
    expect(spy).toHaveBeenCalledWith('https://findahelpline.com');

    // Tapping the dimmed area outside the sheet dismisses it (no navigation). The backdrop is
    // intentionally a11y-hidden (the sheet is the modal focus trap), so reach it by prop.
    await fireEvent.press(getByTestId('crisis-resources-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
