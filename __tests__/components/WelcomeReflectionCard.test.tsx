/**
 * The "Welcome reflection" card at the top of the Journal tab (client revisions 10/14 p.35, N15.53
 * to N15.61): titled "Welcome reflection", tapping it opens the full reflection, and the ••• menu's
 * "Delete" asks "Delete your welcome reflection?" / "This can’t be undone." with "Delete" and
 * "Cancel" first; only Delete removes it (then the card is gone). One render per file.
 */
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WelcomeReflectionCard } from '@features/welcome-reflection';

const mockFetch = jest.fn();
const mockDelete = jest.fn(() => Promise.resolve());
const mockRequest = jest.fn();

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/welcome-reflection/api', () => ({
  fetchWelcomeReflection: () => mockFetch(),
  deleteWelcomeReflection: () => mockDelete(),
  requestWelcomeReflection: () => mockRequest(),
}));

const BODY =
  'You came here wanting calmer days, and that already says a lot. Most days feel heavy, and you tend to carry it on your own. Wanting more good days than hard ones is a gentle place to start.';

it('opens the full reflection, and deletes it only after the confirmation', async () => {
  mockFetch.mockResolvedValue({
    status: 'ready',
    body: BODY,
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:00:00Z',
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <WelcomeReflectionCard />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Welcome reflection')).toBeTruthy(); // N15.54
  expect(screen.getByText(BODY)).toBeTruthy();

  // Tapping it opens the full reflection (N15.55).
  await fireEvent.press(screen.getByTestId('welcome-reflection-card'));
  expect(screen.getAllByText(BODY).length).toBe(2);
  expect(screen.getByText('BASED ON YOUR ANSWERS')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Go back'));

  // ••• > Delete asks first (N15.58 to N15.61).
  await fireEvent.press(screen.getByLabelText('Welcome reflection options'));
  await fireEvent.press(screen.getByText('Delete'));
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0]! as [
    string,
    string,
    { text: string; style?: string; onPress?: () => void }[],
  ];
  expect(title).toBe('Delete your welcome reflection?');
  expect(message).toBe('This can’t be undone.');
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
  expect(buttons[1]!.style).toBe('destructive');
  expect(mockDelete).not.toHaveBeenCalled(); // nothing happens before the answer

  // Delete: removed, and the card goes away.
  mockFetch.mockResolvedValue({
    status: 'deleted',
    body: null,
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:05:00Z',
  });
  await act(async () => {
    buttons[1]!.onPress!();
  });
  expect(mockDelete).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByText('Welcome reflection')).toBeNull());
  alert.mockRestore();
});
