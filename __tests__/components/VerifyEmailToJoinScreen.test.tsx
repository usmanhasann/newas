import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { VerifyEmailToJoinScreen } from '@features/circles/screens/VerifyEmailToJoinScreen';

const mockJoin = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useJoinByCode: () => ({ mutateAsync: mockJoin }),
}));
// Stand in for the real verify screen: expose a control that fires onConfirmed (verification success).
jest.mock('@features/email-verification', () => ({
  EmailConfirmationScreen: ({ onConfirmed }: { onConfirmed: () => void }) => {
    const { Text } = require('react-native');
    return <Text onPress={onConfirmed}>__confirm__</Text>;
  },
}));
const mockToastSuccess = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { error: jest.fn(), success: (m: string) => mockToastSuccess(m), info: jest.fn() },
}));

describe('<VerifyEmailToJoinScreen /> — resumes the pending join after verifying', () => {
  beforeEach(() => {
    mockJoin.mockReset();
    mockToastSuccess.mockReset();
  });

  it('opens the circle when the code joins an approved (public) membership', async () => {
    mockJoin.mockResolvedValue({ circleId: 'circle-1', status: 'approved', name: 'Runners' });
    const navigation = { replace: jest.fn(), goBack: jest.fn() };
    const route = { params: { code: 'ABC123' } } as never;
    const { getByText } = await render(
      <VerifyEmailToJoinScreen navigation={navigation as never} route={route} />,
    );

    fireEvent.press(getByText('__confirm__'));

    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith('ABC123'));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('CircleDetail', { circleId: 'circle-1' }),
    );
  });

  it('shows a pending message and goes back for a requested (private) join', async () => {
    mockJoin.mockResolvedValue({ circleId: 'circle-2', status: 'requested', name: 'Inner' });
    const navigation = { replace: jest.fn(), goBack: jest.fn() };
    const route = { params: { code: 'XYZ' } } as never;
    const { getByText } = await render(
      <VerifyEmailToJoinScreen navigation={navigation as never} route={route} />,
    );

    fireEvent.press(getByText('__confirm__'));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Inner'));
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
