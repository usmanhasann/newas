/**
 * Change email, for someone who forgot the current password (N5, client revisions 10/14 p.19):
 * "Forgot your current password?" opens the same code reset as the sign-in page, for this email,
 * and someone who also lost the old inbox is pointed to support (the check is never weakened).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeEmailScreen } from '@features/security/screens/ChangeEmailScreen';

jest.mock('@features/security/api', () => ({
  requestEmailChange: jest.fn(),
  confirmEmailChange: jest.fn(),
  refreshAccount: jest.fn(),
}));
jest.mock('@features/security/hooks', () => ({
  securityKeys: { methods: (uid?: string) => ['sign-in-methods', uid] },
  useSignInMethods: () => ({
    data: { email: 'sam@example.com', hasPassword: true, providers: ['email'] },
  }),
}));

describe('<ChangeEmailScreen /> — forgot the current password', () => {
  it('opens the code reset for this email and shows the support pointer', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText } = await render(
      <QueryClientProvider client={new QueryClient()}>
        <ChangeEmailScreen navigation={navigation as never} route={{} as never} />
      </QueryClientProvider>,
    );
    expect(
      getByText(
        'Forgot your password and can’t get into your current email either? Contact us at support@lysm.app and we’ll help.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Forgot your current password?'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', {
      email: 'sam@example.com',
    });
  });
});
