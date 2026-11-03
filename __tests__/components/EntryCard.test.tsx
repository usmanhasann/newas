import { render, fireEvent } from '@testing-library/react-native';
import { EntryCard } from '@features/journal/components/EntryCard';
import type { JournalEntry } from '@app-types/database';

const entry: JournalEntry = {
  id: 'e1',
  user_id: 'u1',
  mood_slug: 'happy',
  mood_slugs: ['happy'],
  note: 'A genuinely good day, start to finish.',
  ai_summary: null,
  ai_status: 'idle',
  ai_error: null,
  shared: true,
  crisis_flagged: false,
  local_date: '2026-06-22',
  created_at: '2026-06-22T15:42:00Z',
  updated_at: '2026-06-22T15:42:00Z',
};

describe('<EntryCard />', () => {
  it('renders the mood label, the note, and a shared indicator', async () => {
    const { getByText } = await render(<EntryCard entry={entry} onPress={() => {}} />);
    expect(getByText('Happy')).toBeTruthy();
    expect(getByText('A genuinely good day, start to finish.')).toBeTruthy();
    expect(getByText('Shared with circle')).toBeTruthy();
  });

  it('omits the shared indicator for a private entry', async () => {
    const { queryByText } = await render(
      <EntryCard entry={{ ...entry, shared: false }} onPress={() => {}} />,
    );
    expect(queryByText('Shared with circle')).toBeNull();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<EntryCard entry={entry} onPress={onPress} />);
    fireEvent.press(getByText('Happy'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
