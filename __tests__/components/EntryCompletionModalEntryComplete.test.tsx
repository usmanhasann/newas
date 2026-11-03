/**
 * A second, third or later entry the same day keeps the "Entry complete" popup (client revisions
 * 10/14 p.27, section 10): check mark + "Entry complete", no streak. Its home button reads "Back to
 * home" like the streak popup's. One render per file.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EntryCompletionModal } from '@features/journal/components/EntryCompletionModal';

const mockIcon = jest.fn();
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string }) => {
    mockIcon(props.name);
    return null;
  },
}));

it('shows "Entry complete" with its check mark and no streak', async () => {
  const onGoHome = jest.fn();
  const screen = await render(
    <EntryCompletionModal
      visible
      completion={{ kind: 'entry' }}
      onSeeSummary={jest.fn()}
      onGoHome={onGoHome}
    />,
  );

  expect(screen.getByText('Entry complete')).toBeTruthy();
  expect(mockIcon.mock.calls.map(([name]) => name)).toContain('checkmark');
  expect(screen.queryByText('DAY STREAK')).toBeNull();
  expect(screen.queryByText('\u{1F525}')).toBeNull();
  expect(screen.getByText('See AI summary')).toBeTruthy();

  await fireEvent.press(screen.getByText('Back to home'));
  expect(onGoHome).toHaveBeenCalledTimes(1);
});
