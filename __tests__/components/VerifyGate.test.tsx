/**
 * The reusable circle-action verification gate (useVerifyGate). Verification is enforced only
 * when an email account acts in a circle; social / anonymous accounts pass straight through. An
 * unverified email account is sent to the confirmation screen and the gated action resumes on
 * success (or is dropped if they back out). The heavy EmailConfirmationScreen is replaced with a
 * prop-capturing stub (renders null — no RN components — so its callbacks can be driven directly).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVerifyGate } from '@features/email-verification/useVerifyGate';
import { useCurrentUser } from '@store/session';
import { useEmailVerified } from '@features/email-verification/hooks';
import { checkVerified } from '@features/email-verification/api';

jest.mock('@features/email-verification/screens/EmailConfirmationScreen', () => {
  const React = require('react');
  const holder: {
    props: { onConfirmed: () => void; onBack: () => void } | null;
    mounted: boolean;
  } = { props: null, mounted: false };
  return {
    __holder: holder,
    EmailConfirmationScreen: (props: { onConfirmed: () => void; onBack: () => void }) => {
      holder.props = props;
      React.useEffect(() => {
        holder.mounted = true;
        return () => {
          holder.mounted = false;
        };
      }, []);
      return null;
    },
  };
});
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: jest.fn(),
}));
jest.mock('@features/email-verification/hooks', () => ({
  useEmailVerified: jest.fn(),
  emailVerifyKeys: { status: (uid?: string) => ['email-verified', uid] },
}));
jest.mock('@features/email-verification/api', () => ({
  checkVerified: jest.fn(),
}));

const userMock = useCurrentUser as jest.Mock;
const verifiedMock = useEmailVerified as jest.Mock;
const checkMock = checkVerified as jest.Mock;
const screenMock = jest.requireMock('@features/email-verification/screens/EmailConfirmationScreen') as {
  __holder: { props: { onConfirmed: () => void; onBack: () => void } | null; mounted: boolean };
};

const emailUser = { id: 'u1', identities: [{ provider: 'email' }] };
const googleUser = { id: 'u2', identities: [{ provider: 'google' }] };

const action = jest.fn();

function Host() {
  const { requireVerified, gate } = useVerifyGate();
  return (
    <>
      <Text testID="act" onPress={() => void requireVerified(action)}>
        act
      </Text>
      {gate}
    </>
  );
}

async function renderHost() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Host />
    </QueryClientProvider>,
  );
}

describe('useVerifyGate — circle actions require a verified email', () => {
  beforeEach(() => {
    action.mockReset();
    checkMock.mockReset();
    verifiedMock.mockReset().mockReturnValue({ data: undefined });
    userMock.mockReset();
    screenMock.__holder.props = null;
    screenMock.__holder.mounted = false;
  });

  it('runs the action immediately for a social account (no email identity) — no check, no gate', async () => {
    userMock.mockReturnValue(googleUser);
    const utils = await renderHost();
    await act(async () => {
      fireEvent.press(utils.getByTestId('act'));
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(checkMock).not.toHaveBeenCalled();
    expect(screenMock.__holder.mounted).toBe(false);
  });

  it('runs immediately for an already-verified email account (cached flag) — no fresh check', async () => {
    userMock.mockReturnValue(emailUser);
    verifiedMock.mockReturnValue({ data: true });
    const utils = await renderHost();
    await act(async () => {
      fireEvent.press(utils.getByTestId('act'));
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('opens the gate WITHOUT running the action for an unverified email account, then resumes on confirm', async () => {
    userMock.mockReturnValue(emailUser);
    verifiedMock.mockReturnValue({ data: false });
    checkMock.mockResolvedValue(false);
    const utils = await renderHost();
    await act(async () => {
      fireEvent.press(utils.getByTestId('act'));
    });
    await waitFor(() => expect(checkMock).toHaveBeenCalledWith('u1'));
    expect(action).not.toHaveBeenCalled();
    await waitFor(() => expect(screenMock.__holder.mounted).toBe(true));
    // Verify → the pending action resumes and the gate closes.
    await act(async () => {
      screenMock.__holder.props?.onConfirmed();
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screenMock.__holder.mounted).toBe(false));
  });

  it('runs immediately when a fresh check confirms verification (verified via the link since load)', async () => {
    userMock.mockReturnValue(emailUser);
    verifiedMock.mockReturnValue({ data: false });
    checkMock.mockResolvedValue(true);
    const utils = await renderHost();
    await act(async () => {
      fireEvent.press(utils.getByTestId('act'));
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screenMock.__holder.mounted).toBe(false);
  });

  it('drops the pending action if the user backs out of the gate', async () => {
    userMock.mockReturnValue(emailUser);
    verifiedMock.mockReturnValue({ data: false });
    checkMock.mockResolvedValue(false);
    const utils = await renderHost();
    await act(async () => {
      fireEvent.press(utils.getByTestId('act'));
    });
    await waitFor(() => expect(screenMock.__holder.mounted).toBe(true));
    await act(async () => {
      screenMock.__holder.props?.onBack();
    });
    await waitFor(() => expect(screenMock.__holder.mounted).toBe(false));
    expect(action).not.toHaveBeenCalled();
  });
});
