/**
 * Where sharing is offered for an entry with concerning words (client 10/14 p.36, N18.10/N18.11):
 * "This entry can’t be shared, but support is always available." with a link to the crisis
 * resources. The client wrote it mid-sentence ending in a comma; standing alone it ends with a
 * period. The link opens the pop-up in place, with the keyboard closed first so it can't hide it.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Keyboard } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { EntryNotShareable } from '@features/crisis';

const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

it('says the entry can’t be shared, and its link opens the crisis resources', async () => {
  const utils = await render(<EntryNotShareable />);
  expect(
    utils.getByText(
      /^This entry can’t be shared, but support is always available\. See crisis resources$/,
    ),
  ).toBeTruthy();
  expect(utils.getByText('See crisis resources').props.accessibilityRole).toBe('link');
  expect(utils.queryByText('You’re not alone in this')).toBeNull();

  await fireEvent.press(utils.getByText('See crisis resources'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(await utils.findByText('You’re not alone in this')).toBeTruthy();
  expect(utils.getByText('Call 988')).toBeTruthy();
});
