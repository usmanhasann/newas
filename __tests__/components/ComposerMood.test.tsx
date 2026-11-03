/**
 * The circle composer's optional mood (client spec 2026-09-29): a small labeled "Mood" button (a
 * mood face plus the word) opens the same circular mood icons as the check-in; the picked mood
 * shows on the draft and goes out with the message; sending clears both. No mood is ever required.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { Composer } from '@features/circles/components/Composer';

jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));

it('adds an optional mood behind the "Mood" button and sends it with the message', async () => {
  const onSend = jest.fn(async (_body: string, _moods: string[]) => true);
  const utils = await render(
    <Composer placeholder="Write a reply…" sendLabel="Send" busy={false} onSend={onSend} />,
  );

  // The button is labeled (not a bare icon).
  expect(utils.getByText('Mood')).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Anxious about tomorrow');
  });
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Add a mood'));
  });
  expect(utils.getByText('How are you feeling?')).toBeTruthy();

  const anxious = await utils.findByLabelText('Anxious');
  await act(async () => {
    fireEvent.press(anxious);
  });
  expect(utils.getByLabelText('Anxious').props.accessibilityState).toMatchObject({ selected: true });
  await act(async () => {
    fireEvent.press(utils.getByText('Done'));
  });
  expect(utils.queryByText('How are you feeling?')).toBeNull();
  expect(utils.getByLabelText('Mood: Anxious')).toBeTruthy(); // on the draft
  expect(utils.getByLabelText('Change mood')).toBeTruthy();

  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(onSend).toHaveBeenCalledWith('Anxious about tomorrow', ['anxious']);
  expect(utils.getByPlaceholderText('Write a reply…').props.value).toBe('');
  expect(utils.queryByLabelText('Mood: Anxious')).toBeNull();
  expect(utils.getByLabelText('Add a mood')).toBeTruthy();
});
