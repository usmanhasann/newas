/**
 * "Verify your email" inside the circle check (the backstop, N5 client revisions 10/14 p.18): a
 * back arrow cancels, there is no "Log out", and verifying resumes the circle action.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EmailConfirmationScreen } from '@features/email-verification/screens/EmailConfirmationScreen';

jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
const mockVerifier: { onVerified?: () => void } = {};
jest.mock('@features/email-verification/components/EmailCodeVerifier', () => ({
  EmailCodeVerifier: (p: { onVerified: () => void }) => {
    mockVerifier.onVerified = p.onVerified;
    return null;
  },
}));

describe('<EmailConfirmationScreen embedded />', () => {
  it('cancels with the back arrow and resumes on verify', async () => {
    const onConfirmed = jest.fn();
    const onBack = jest.fn();
    const { getByLabelText, queryByText } = await render(
      <EmailConfirmationScreen embedded onConfirmed={onConfirmed} onBack={onBack} />,
    );
    expect(queryByText('Log out')).toBeNull();
    await fireEvent.press(getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalled();
    mockVerifier.onVerified!();
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
