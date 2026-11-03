import { render, fireEvent, act } from '@testing-library/react-native';
import { DeleteAccountScreen } from '@features/profile';
import { useDeleteAccount } from '@features/auth';

const mutate = jest.fn();
jest.mock('@features/auth', () => ({ useDeleteAccount: jest.fn() }));
jest.mock('@store/toast', () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

const delMock = useDeleteAccount as jest.Mock;
const nav = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  mutate.mockReset();
  delMock.mockReturnValue({ mutate, isPending: false });
});

describe('<DeleteAccountScreen /> — irreversible, type-to-confirm', () => {
  it('warns it is permanent and that the subscription must be canceled separately', async () => {
    const { getByText } = await render(
      <DeleteAccountScreen navigation={nav as never} route={{} as never} />,
    );
    expect(getByText('This can’t be undone')).toBeTruthy();
    expect(getByText(/permanently removes your journal entries/)).toBeTruthy();
    expect(getByText('Cancel your subscription separately')).toBeTruthy();
    expect(getByText(/does not cancel your subscription/)).toBeTruthy();
  });

  it('keeps the delete button disabled until "delete" is typed, then deletes', async () => {
    const { getByText, getByPlaceholderText } = await render(
      <DeleteAccountScreen navigation={nav as never} route={{} as never} />,
    );

    expect(getByText('Delete my account')).toBeDisabled(); // nothing typed

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('delete'), 'nope');
    });
    expect(getByText('Delete my account')).toBeDisabled(); // wrong text

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('delete'), 'DELETE');
    });
    expect(getByText('Delete my account')).toBeEnabled(); // "delete" (any case)

    await act(async () => {
      fireEvent.press(getByText('Delete my account'));
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
