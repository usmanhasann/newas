/**
 * Streak popup formatting (client revisions 10/14 p.27, section 9): numbers from 1,000 up get
 * commas, the big streak number included. One render per file.
 */
import { render } from '@testing-library/react-native';
import { EntryCompletionModal } from '@features/journal/components/EntryCompletionModal';

it('shows 1,000 with a comma, in the number and the label read aloud', async () => {
  const screen = await render(
    <EntryCompletionModal
      visible
      completion={{ kind: 'streak', streak: 1000, message: '1,000 days. Truly incredible. See you tomorrow.' }}
      onSeeSummary={jest.fn()}
      onGoHome={jest.fn()}
    />,
  );

  expect(screen.getByText('1,000')).toBeTruthy();
  expect(screen.getByLabelText('1,000 day streak')).toBeTruthy();
  expect(screen.getByText('1,000 days. Truly incredible. See you tomorrow.')).toBeTruthy();
});
