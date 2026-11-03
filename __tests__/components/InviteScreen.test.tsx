import { render, fireEvent, act } from '@testing-library/react-native';
import { InviteScreen } from '@features/circles/screens/InviteScreen';

const mockMutateAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({ data: { id: 'c1', name: 'Family', invite_code: 'ABC123' } }),
  useInviteByEmail: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const nav = { goBack: jest.fn() } as never;
const route = { params: { circleId: 'c1' } } as never;

const renderScreen = () => render(<InviteScreen navigation={nav} route={route} />);

describe('<InviteScreen /> (Bubble "Invite a loved one" parity)', () => {
  beforeEach(() => mockMutateAsync.mockClear());

  it('renders the hero, nickname and email field, with no per-person visibility controls', async () => {
    const { getByText, queryByText, queryByLabelText } = await renderScreen();
    expect(getByText('Invite a loved one')).toBeTruthy();
    expect(getByText('Nickname')).toBeTruthy();
    // Everyone in a circle sees everything shared there (client spec 2026-09-29).
    expect(queryByText('What can they see?')).toBeNull();
    expect(queryByLabelText('Your mood')).toBeNull();
    expect(queryByLabelText('AI summaries')).toBeNull();
  });

  it('toggling to Phone swaps the email field for a phone field', async () => {
    const { getByText, findByPlaceholderText, queryByPlaceholderText } =
      await renderScreen();
    expect(queryByPlaceholderText('Email')).toBeTruthy();
    fireEvent.press(getByText('Phone'));
    expect(await findByPlaceholderText('Phone number')).toBeTruthy();
    expect(queryByPlaceholderText('Email')).toBeNull();
  });

  it('sends an email invite carrying just the circle, email and nickname', async () => {
    const { getByText, getByPlaceholderText } = await renderScreen();

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Name'), 'Mum');
      fireEvent.changeText(getByPlaceholderText('Email'), 'mum@example.com');
    });

    await act(async () => {
      fireEvent.press(getByText('Send Invitation'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      circleId: 'c1',
      email: 'mum@example.com',
      name: 'Mum',
    });
  });

  it('does not send while the email is invalid (button disabled)', async () => {
    const { getByText, getByPlaceholderText } = await renderScreen();
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Email'), 'not-an-email');
    });
    await act(async () => {
      fireEvent.press(getByText('Send Invitation'));
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('invite code supports the native press-and-hold Copy (selectable text)', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('ABC123').props.selectable).toBe(true);
  });
});
