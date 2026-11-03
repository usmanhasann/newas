/**
 * The standalone "Verify your email" screen (N5, client revisions 10/14 p.18): what an older email
 * + password account that never verified sees the next time the app opens. It holds the 6-digit
 * code step; "Log out" is the only way past it. (The old link email and its "Send verification
 * email" button are gone: the email now carries a code.)
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EmailConfirmationScreen } from '@features/email-verification/screens/EmailConfirmationScreen';

const mockSignOut = jest.fn();
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: mockSignOut }) }));
const mockVerifier: { onVerified?: () => void } = {};
jest.mock('@features/email-verification/components/EmailCodeVerifier', () => ({
  EmailCodeVerifier: (p: { onVerified: () => void }) => {
    mockVerifier.onVerified = p.onVerified;
    return null;
  },
}));

describe('<EmailConfirmationScreen /> — app-open check', () => {
  it('shows the code step with Log out and no way back', async () => {
    const { getByText, queryByLabelText, queryByText } = await render(
      <EmailConfirmationScreen />,
    );
    expect(getByText('Verify your email')).toBeTruthy();
    expect(
      getByText('To keep your account safe, confirm your email before you continue.'),
    ).toBeTruthy();
    expect(mockVerifier.onVerified).toBeDefined();
    expect(queryByLabelText('Go back')).toBeNull();
    expect(queryByText('Send verification email')).toBeNull();
    // Verifying needs nothing from the screen: the gate reads the updated flag and moves on.
    expect(() => mockVerifier.onVerified!()).not.toThrow();

    await fireEvent.press(getByText('Log out'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
