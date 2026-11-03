/**
 * An entry with concerning words on its own page (client 10/14 p.36, N18.04 to N18.07): no AI
 * reflection is made for it (never asked for, even if its status says idle), and where the
 * reflection would be: "You don’t have to carry this alone. Talking to someone can help, right
 * now." followed by the 988 and Crisis Text Line options, which call or text. The client wrote the
 * line mid-sentence ending in a comma; standing alone it ends with a period.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { EntryDetailScreen } from '@features/journal/screens/EntryDetailScreen';

const mockGenerate = jest.fn();

jest.mock('@features/journal/hooks', () => ({
  useEntry: () => ({
    isLoading: false,
    data: {
      id: 'e1',
      note: 'I want to end my life.',
      mood_slug: 'sad',
      mood_slugs: ['sad'],
      ai_status: 'idle',
      ai_summary: null,
      crisis_flagged: true,
      shared: false,
      created_at: '2026-10-21T10:00:00Z',
    },
  }),
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: () => mockGenerate(), isPending: false }),
}));
jest.mock('@features/circles', () => ({
  useEntryShares: () => ({ data: { circleIds: [], version: null, postIds: [], circles: [] } }),
}));

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

it('shows the support message and the two crisis lines instead of a reflection', async () => {
  const utils = await render(
    <EntryDetailScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { entryId: 'e1' } } as never}
    />,
  );

  expect(
    utils.getByText('You don’t have to carry this alone. Talking to someone can help, right now.'),
  ).toBeTruthy();
  expect(utils.getByText('988 Suicide & Crisis Lifeline')).toBeTruthy();
  expect(utils.getByText('Crisis Text Line')).toBeTruthy();
  expect(utils.queryByText('Outside the US')).toBeNull(); // only the two options the client named
  expect(utils.queryByText('AI Insight')).toBeNull();
  expect(mockGenerate).not.toHaveBeenCalled();

  await fireEvent.press(utils.getByText('Call 988'));
  await fireEvent.press(utils.getByText('Text 988'));
  await fireEvent.press(utils.getByText('Text HOME to 741741'));
  expect(openURL).toHaveBeenCalledWith('tel:988');
  expect(openURL).toHaveBeenCalledWith('sms:988');
  expect(openURL).toHaveBeenCalledWith('sms:741741');

  // The entry itself is saved and shown like any other, privately.
  expect(utils.getByText('I want to end my life.')).toBeTruthy();
  expect(utils.getByText('Private: only you can see this')).toBeTruthy();
});
