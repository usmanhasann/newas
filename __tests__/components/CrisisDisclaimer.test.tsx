import { render, fireEvent } from '@testing-library/react-native';
import { CrisisDisclaimer } from '@features/crisis';

describe('<CrisisDisclaimer /> — inline disclaimer that opens the resources popup', () => {
  it('renders the muted disclaimer text', async () => {
    const { getByText } = await render(<CrisisDisclaimer />);
    expect(getByText(/not a substitute for professional support/)).toBeTruthy();
    expect(getByText('See crisis resources')).toBeTruthy();
  });

  it('opens the popup as an overlay (not navigation) when the inline link is tapped', async () => {
    const { getByText, queryByText, findByText } = await render(<CrisisDisclaimer />);

    // Closed initially — the resources content isn't shown yet.
    expect(queryByText('You’re not alone in this')).toBeNull();

    // Tapping the inline link opens the popup in place (no screen change). The modal mounts
    // asynchronously, so wait for its content to appear.
    await fireEvent.press(getByText('See crisis resources'));
    expect(await findByText('You’re not alone in this')).toBeTruthy();
    expect(getByText('988 Suicide & Crisis Lifeline')).toBeTruthy();
  });
});
