import { render, fireEvent } from '@testing-library/react-native';
import { MoodSelector } from '@components';

describe('<MoodSelector /> (§1.2 multi-select + §6 icons)', () => {
  it('renders every mood with its non-emoji icon + label', async () => {
    const { getByLabelText, getByText } = await render(
      <MoodSelector selected={[]} onToggle={() => {}} />,
    );
    expect(getByText('Happy')).toBeTruthy();
    expect(getByLabelText('Frustrated')).toBeTruthy();
  });

  it('calls onToggle when an available mood is pressed', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(<MoodSelector selected={[]} onToggle={onToggle} />);
    fireEvent.press(getByLabelText('Sad'));
    expect(onToggle).toHaveBeenCalledWith('sad');
  });

  it('does NOT call onToggle for a disabled mood; calls onDisabledPress instead', async () => {
    const onToggle = jest.fn();
    const onDisabledPress = jest.fn();
    const { getByLabelText } = await render(
      <MoodSelector
        selected={['happy']}
        onToggle={onToggle}
        disabledKeys={['angry', 'sad', 'calm']}
        onDisabledPress={onDisabledPress}
      />,
    );
    fireEvent.press(getByLabelText('Angry'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onDisabledPress).toHaveBeenCalledWith('angry');
  });

  it('never disables a selected mood (so it can always be removed/swapped)', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(
      <MoodSelector
        selected={['angry']}
        onToggle={onToggle}
        disabledKeys={['angry', 'sad', 'calm']}
        onDisabledPress={() => {}}
      />,
    );
    // 'angry' is selected → still tappable (removal) despite being in disabledKeys.
    fireEvent.press(getByLabelText('Angry'));
    expect(onToggle).toHaveBeenCalledWith('angry');
  });

  it('renders moods in a custom `order` when provided (Home "Today\'s Mood" row)', async () => {
    const { getAllByRole } = await render(
      <MoodSelector
        selected={['tired', 'calm']}
        order={['tired', 'calm', 'happy', 'content', 'grateful', 'neutral', 'anxious', 'sad', 'frustrated', 'angry']}
        onToggle={() => {}}
      />,
    );
    const labels = getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.slice(0, 3)).toEqual(['Tired', 'Calm', 'Happy']);
  });

  it('marks selected moods and still calls onToggle when one is tapped (badge is visual only)', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(
      <MoodSelector selected={['tired']} showSelectedBadge onToggle={onToggle} />,
    );
    expect(getByLabelText('Tired').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByLabelText('Tired'));
    expect(onToggle).toHaveBeenCalledWith('tired');
  });
});
