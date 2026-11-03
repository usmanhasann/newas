import { render, fireEvent } from '@testing-library/react-native';
import { CirclesPrivacyStep } from '@features/onboarding/screens/steps/CirclesPrivacyStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step: 'welcome',
    steps: [],
    progress: { index: 1, total: 20 },
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

describe('<CirclesPrivacyStep /> — private vs public circles', () => {
  it('matches the client screenshot: labeled bubbles, one-line headline, two colored lines, no tags', async () => {
    const nav = makeNav();
    const { getByText, getByLabelText, queryAllByText } = await render(
      <CirclesPrivacyStep nav={nav} />,
    );

    expect(getByText('Two ways to open up.')).toBeTruthy();
    // "Private Circles" / "Public Circles" lead their lines, bold in the circle colors. (The
    // matcher folds the line break into a space.)
    expect(
      getByText(
        /Private Circles are for your closest people\.\s+Public Circles are open to anyone\./,
      ),
    ).toBeTruthy();
    expect(getByText('Private Circles')).toHaveStyle({ color: '#5A1F9A' });
    expect(getByText('Public Circles')).toHaveStyle({ color: '#1F5C3C' });
    // The bubbles carry the names (lock + Private, globe + Public); the tags below are gone.
    expect(getByLabelText('Two speech bubbles: Private and Public')).toBeTruthy();
    expect(queryAllByText('Private')).toHaveLength(1);
    expect(queryAllByText('Public')).toHaveLength(1);
  });

  it('advances on the "Got it" CTA (informational — never gated)', async () => {
    const nav = makeNav();
    const { getByText } = await render(<CirclesPrivacyStep nav={nav} />);

    fireEvent.press(getByText('Got it'));
    expect(nav.goNext).toHaveBeenCalledTimes(1);
  });

  it('offers back navigation when the flow allows it', async () => {
    const nav = makeNav({ canBack: true });
    const { getByLabelText } = await render(<CirclesPrivacyStep nav={nav} />);

    fireEvent.press(getByLabelText('Go back'));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back control on a step the flow marks as non-returnable', async () => {
    const nav = makeNav({ canBack: false });
    const { queryByLabelText } = await render(<CirclesPrivacyStep nav={nav} />);

    expect(queryByLabelText('Go back')).toBeNull();
  });
});
