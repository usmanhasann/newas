/**
 * Bio: 150-character cap (spaces included), enforced as the input's maxLength so typing just stops,
 * with a live "N/150" counter under the field that counts up as the user types.
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditProfileScreen } from '@features/profile/screens/EditProfileScreen';
import { BIO_MAX_LENGTH, bioCounter } from '@features/profile/bio';

const mockProfile: { bio: string | null } = { bio: null };

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Najam',
      bio: mockProfile.bio,
      timezone: 'UTC',
      avatar_url: null,
      personal_reflection_style: 'gentle',
      personal_reflection_style_secondary: null,
    },
  }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@features/profile/avatar', () => ({ uploadAvatar: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));

async function renderScreen() {
  const nav = { goBack: jest.fn() };
  return render(<EditProfileScreen navigation={nav as never} route={{} as never} />);
}

beforeEach(() => {
  mockProfile.bio = null;
});

describe('bioCounter', () => {
  it('formats as "N/150", counting spaces', () => {
    expect(BIO_MAX_LENGTH).toBe(150);
    expect(bioCounter('')).toBe('0/150');
    expect(bioCounter('a b')).toBe('3/150');
    expect(bioCounter('x'.repeat(150))).toBe('150/150');
  });
});

describe('<EditProfileScreen /> bio field', () => {
  it('caps typing at 150 characters via maxLength and starts the counter at "0/150"', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();
    expect(getByPlaceholderText('A little about you').props.maxLength).toBe(150);
    expect(getByText('0/150')).toBeTruthy();
  });

  it('updates the counter live as the user types (spaces included)', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await renderScreen();
    const input = getByPlaceholderText('A little about you');
    await act(async () => {
      fireEvent.changeText(input, 'Hello');
    });
    expect(getByText('5/150')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(input, 'Hello world');
    });
    expect(getByText('11/150')).toBeTruthy();
    expect(queryByText('5/150')).toBeNull();
  });

  it('counts an existing bio when the screen opens', async () => {
    mockProfile.bio = 'Just me';
    const { getByText } = await renderScreen();
    expect(getByText('7/150')).toBeTruthy();
  });

  it('reaches exactly "150/150" at the cap', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('A little about you'), 'y'.repeat(150));
    });
    expect(getByText('150/150')).toBeTruthy();
  });
});
