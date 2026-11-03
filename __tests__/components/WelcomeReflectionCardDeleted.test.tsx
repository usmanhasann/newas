/**
 * A deleted Welcome reflection (or none at all) shows no card on the Journal tab (client revisions
 * 10/14 p.35, N15.56). One render per file.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WelcomeReflectionCard } from '@features/welcome-reflection';

const mockFetch = jest.fn();

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/welcome-reflection/api', () => ({
  fetchWelcomeReflection: () => mockFetch(),
  deleteWelcomeReflection: jest.fn(),
  requestWelcomeReflection: jest.fn(),
}));

it('renders nothing for a deleted reflection', async () => {
  mockFetch.mockResolvedValue({ status: 'deleted', body: null, createdAt: 'x', updatedAt: 'y' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <WelcomeReflectionCard />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  expect(screen.queryByText('Welcome reflection')).toBeNull();
  expect(screen.queryByTestId('welcome-reflection-card')).toBeNull();
});
