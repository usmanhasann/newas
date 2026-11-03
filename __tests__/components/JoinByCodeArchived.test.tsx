/**
 * Client revisions 10/14 p.23 (N3): no one new can join an archived circle, by code either. When the
 * server refuses an invite code for that reason, the Invite Code card says so under the field
 * ("This circle has been archived, so no one new can join.") instead of the connection message, and
 * nothing opens. One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { JoinByCodeCard } from '@features/circles/components/JoinByCodeCard';

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', identities: [{ provider: 'apple' }] }),
}));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@features/email-verification', () => ({
  useEmailVerified: () => ({ data: true }),
  checkVerified: () => Promise.resolve(true),
}));
const mockJoinByCode = jest.fn((_code: string) => {
  const { CircleArchivedError } = jest.requireActual('@features/circles/api') as {
    CircleArchivedError: new () => Error;
  };
  return Promise.reject(new CircleArchivedError());
});
jest.mock('@features/circles/hooks', () => ({
  useJoinByCode: () => ({ mutateAsync: (c: string) => mockJoinByCode(c), isPending: false }),
}));

it('an archived circle’s code: says no one new can join, keeps the code, opens nothing', async () => {
  const onJoined = jest.fn();
  const onRequested = jest.fn();
  const utils = await render(
    <JoinByCodeCard onJoined={onJoined} onRequested={onRequested} onNeedsVerification={jest.fn()} />,
  );

  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('e.g. A1B2C3D4'), 'ARCH1VED');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Join Circle'));
  });

  expect(mockJoinByCode).toHaveBeenCalledWith('ARCH1VED');
  expect(utils.getByText('This circle has been archived, so no one new can join.')).toBeTruthy();
  expect(
    utils.queryByText('We couldn’t join that circle. Check your connection and try again.'),
  ).toBeNull();
  expect(utils.getByDisplayValue('ARCH1VED')).toBeTruthy();
  expect(onJoined).not.toHaveBeenCalled();
  expect(onRequested).not.toHaveBeenCalled();
});
