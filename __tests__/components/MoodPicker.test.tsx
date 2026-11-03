import { render, fireEvent } from '@testing-library/react-native';
import { useToastStore } from '@store/toast';
import { MoodPicker } from '@features/moods';
import type { MoodKey } from '@theme';

describe('<MoodPicker /> (§1.2/§1.3 per-entry multi-select)', () => {
  beforeEach(() => useToastStore.getState().hide());

  it('shows per-entry slots remaining and adds a mood when there is room', async () => {
    const onChange = jest.fn();
    const { getByText, getByLabelText, queryByText } = await render(
      <MoodPicker value={['grateful']} onChange={onChange} />,
    );
    // One selected of three → two remaining (spec §1.3 wording).
    expect(getByText('Two mood slots remaining')).toBeTruthy();
    // Locked: the buggy per-day wording must never appear.
    expect(queryByText(/out of/i)).toBeNull();
    expect(queryByText(/left of/i)).toBeNull();
    fireEvent.press(getByLabelText('Tired'));
    expect(onChange).toHaveBeenCalledWith(['grateful', 'tired']);
  });

  it('tapping a selected mood removes it (frees a slot to swap — §1.3)', async () => {
    // The swap-nets-zero maths is covered in entrySelection.test.ts; here we just
    // verify the picker toggles a selected mood off (freeing the slot for a new one).
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <MoodPicker value={['grateful']} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('Grateful'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('at the cap: a 4th distinct mood is blocked with a toast, selected moods stay swappable', async () => {
    const full: MoodKey[] = ['happy', 'sad', 'calm'];
    const onChange = jest.fn();
    const { getByLabelText } = await render(<MoodPicker value={full} onChange={onChange} />);

    // Unselected mood at the cap → disabled → no change, a guidance toast instead.
    fireEvent.press(getByLabelText('Angry'));
    expect(onChange).not.toHaveBeenCalled();
    expect(useToastStore.getState().message).toBe(
      'You can pick up to 3 moods per entry. Tap a selected mood to swap it.',
    );

    // A selected mood is always removable (frees a slot to swap).
    fireEvent.press(getByLabelText('Happy'));
    expect(onChange).toHaveBeenCalledWith(['sad', 'calm']);
  });
});
