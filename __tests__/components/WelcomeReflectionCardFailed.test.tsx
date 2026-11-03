/**
 * The Journal tab's Welcome reflection card when writing it failed: "Failed to load" with "Try
 * again", which asks for it again (client revisions 10/14 p.35: the card never disappears on its
 * own). One render per file.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WelcomeReflectionCard } from '@features/welcome-reflection';

const mockFetch = jest.fn();
const mockRequest = jest.fn();

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/welcome-reflection/api', () => ({
  fetchWelcomeReflection: () => mockFetch(),
  deleteWelcomeReflection: jest.fn(),
  requestWelcomeReflection: () => mockRequest(),
}));

it('offers Try again, and shows the reflection once it is written', async () => {
  mockFetch.mockResolvedValue({ status: 'failed', body: null, createdAt: 'x', updatedAt: 'x' });
  mockRequest.mockResolvedValue({ status: 'ready', body: 'You came here for calmer days.' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <WelcomeReflectionCard />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Failed to load')).toBeTruthy();
  expect(screen.getByText('Welcome reflection')).toBeTruthy(); // still there

  mockFetch.mockResolvedValue({
    status: 'ready',
    body: 'You came here for calmer days.',
    createdAt: 'x',
    updatedAt: 'y',
  });
  await fireEvent.press(screen.getByText('Try again'));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByText('You came here for calmer days.')).toBeTruthy());
  expect(screen.queryByText('Failed to load')).toBeNull();
});
