import { render, fireEvent } from '@testing-library/react-native';
import { OptionList, type OptionItem } from '@components';

type Letter = 'a' | 'b' | 'c';
const OPTS: OptionItem<Letter>[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('<OptionList />', () => {
  it('single mode: tapping a row selects that value (radio)', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<OptionList options={OPTS} value={null} onChange={onChange} />);
    fireEvent.press(getByLabelText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('multi mode: tapping a row toggles it via onToggle (checkbox)', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(
      <OptionList multi options={OPTS} values={['a']} onToggle={onToggle} maxSelections={2} />,
    );
    fireEvent.press(getByLabelText('Beta'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });

  it('multi mode: at the cap, unselected rows lock but a selected row can still toggle off', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(
      <OptionList multi options={OPTS} values={['a', 'b']} onToggle={onToggle} maxSelections={2} />,
    );
    // Gamma is unselected and we're at the cap of 2 → locked; the press is ignored.
    fireEvent.press(getByLabelText('Gamma'));
    expect(onToggle).not.toHaveBeenCalled();
    // Alpha is already selected → still tappable so the user can deselect to swap.
    fireEvent.press(getByLabelText('Alpha'));
    expect(onToggle).toHaveBeenCalledWith('a');
  });
});
