/**
 * deleteAccount sends Apple's one-time code (when there is one) to the delete-account Edge Function;
 * a failure is passed through unchanged.
 */
import { deleteAccount } from '@features/auth/api';

const mockInvoke = jest.fn();
jest.mock('@lib', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  logger: { warn: jest.fn() },
}));

beforeEach(() => mockInvoke.mockReset());

it('sends the Apple code when there is one, and an empty body otherwise', async () => {
  mockInvoke.mockResolvedValue({ data: { status: 'deleted' }, error: null });
  await deleteAccount('apple-code-1');
  expect(mockInvoke).toHaveBeenLastCalledWith('delete-account', {
    body: { apple_authorization_code: 'apple-code-1' },
  });
  await deleteAccount();
  expect(mockInvoke).toHaveBeenLastCalledWith('delete-account', { body: {} });
});

it('a failure is passed through', async () => {
  const err = { message: 'boom', context: { status: 500 } };
  mockInvoke.mockResolvedValue({ data: null, error: err });
  await expect(deleteAccount()).rejects.toBe(err);
});
