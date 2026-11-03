/**
 * The floating action button reads "+ New Entry" (icon + label) on every screen that uses it
 * (home page and All Entries). Adding the label must not change its press behavior.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { Fab } from '@components';

describe('<Fab />', () => {
  it('shows the "New Entry" label by default', async () => {
    const utils = await render(<Fab onPress={jest.fn()} />);
    expect(utils.getByText('New Entry')).toBeTruthy();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    const utils = await render(<Fab onPress={onPress} />);
    fireEvent.press(utils.getByText('New Entry'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom label', async () => {
    const utils = await render(<Fab onPress={jest.fn()} label="Add" />);
    expect(utils.getByText('Add')).toBeTruthy();
  });
});
