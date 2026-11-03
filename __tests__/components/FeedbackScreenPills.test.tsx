/**
 * Client revisions 10/14, p.12 to 13 (O24): Send Feedback category pills.
 * - Labels Idea, Bug, What’s working, Other ("Praise" renamed); What’s working saves as such.
 * - Separate capsule pills sized to their text, about 36px tall with 16px side padding, 8px gaps,
 *   in two rows (Idea, Bug / What’s working, Other).
 * - Selected: solid deep brand purple, white bold text, no border, no shadow.
 * - Unselected: white, no border, muted gray bold text, soft shadow underneath.
 * - The rest of the screen (subtext, CATEGORY label, message box, send button) is unchanged.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { FeedbackScreen } from '@features/help/screens/FeedbackScreen';
import { shadow } from '@theme';

const mockSubmit = jest.fn(() => Promise.resolve());
jest.mock('@features/help/hooks', () => ({
  useSubmitFeedback: () => ({ mutateAsync: mockSubmit, isPending: false }),
}));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const split = (v: unknown) => String(v).split(' ').filter(Boolean);

it('renders the four pills in the new style and sends What’s working under its own name', async () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <FeedbackScreen navigation={navigation as never} route={{} as never} />,
  );

  // Unchanged copy around the pills.
  expect(
    utils.getByText(
      'We read everything. Tell us what’s working or what could be better.',
    ),
  ).toBeTruthy();
  expect(split(utils.getByText('Category').props.className)).toEqual(
    expect.arrayContaining([
      'uppercase',
      'tracking-label',
      'text-ink-soft',
      'font-sans-semibold',
    ]),
  );
  expect(utils.getByPlaceholderText('What’s on your mind?')).toBeTruthy();

  // Final set and order; "Praise" is gone.
  const pills = utils
    .getAllByRole('button')
    .filter((b) => b.props.accessibilityState?.selected !== undefined);
  const labelOf = (label: string) => utils.getByRole('button', { name: label });
  expect(pills).toHaveLength(4);
  for (const label of ['Idea', 'Bug', 'What’s working', 'Other'])
    expect(labelOf(label)).toBeTruthy();
  expect(utils.queryByText('Praise')).toBeNull();
  expect(pills).toEqual([
    labelOf('Idea'),
    labelOf('Bug'),
    labelOf('What’s working'),
    labelOf('Other'),
  ]);

  // Two rows of two, 8px gaps between pills and between rows.
  const rowOf = (label: string) => labelOf(label).parent;
  expect(rowOf('Idea')).toBe(rowOf('Bug'));
  expect(rowOf('What’s working')).toBe(rowOf('Other'));
  expect(rowOf('Idea')).not.toBe(rowOf('Other'));
  for (const label of ['Idea', 'Other']) {
    expect(split(rowOf(label)!.props.className)).toEqual(
      expect.arrayContaining(['flex-row', 'flex-wrap', 'gap-2']),
    );
  }
  expect(split(rowOf('Idea')!.parent!.props.className)).toEqual(
    expect.arrayContaining(['gap-2', 'mb-5']),
  );

  const expectSelected = (label: string) => {
    const pill = labelOf(label);
    expect(pill.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    const classes = split(pill.props.className);
    expect(classes).toEqual(
      expect.arrayContaining(['bg-brand-600', 'rounded-full', 'h-9', 'px-4']),
    );
    expect(classes.some((c) => c === 'border' || c.startsWith('border-'))).toBe(false);
    expect(classes).not.toContain('bg-brand-50');
    expect(pill.props.style ?? undefined).toBeUndefined();
    expect(split(utils.getByText(label).props.className)).toEqual(
      expect.arrayContaining(['font-sans-bold', 'text-ink-inverse']),
    );
  };
  const expectUnselected = (label: string) => {
    const pill = labelOf(label);
    expect(pill.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    const classes = split(pill.props.className);
    expect(classes).toEqual(
      expect.arrayContaining(['bg-surface', 'rounded-full', 'h-9', 'px-4']),
    );
    expect(classes.some((c) => c === 'border' || c.startsWith('border-'))).toBe(false);
    expect(pill.props.style).toEqual(expect.objectContaining(shadow.pill));
    const text = split(utils.getByText(label).props.className);
    expect(text).toEqual(expect.arrayContaining(['font-sans-bold', 'text-ink-soft']));
    expect(text).not.toContain('text-ink');
    expect(text).not.toContain('text-brand-600');
  };

  // Idea is selected when the screen opens.
  expectSelected('Idea');
  for (const label of ['Bug', 'What’s working', 'Other']) expectUnselected(label);

  // Tapping What’s working moves the selection.
  await fireEvent.press(labelOf('What’s working'));
  expectSelected('What’s working');
  for (const label of ['Idea', 'Bug', 'Other']) expectUnselected(label);

  // It saves under its new name (not the old Praise).
  await fireEvent.changeText(
    utils.getByPlaceholderText('What’s on your mind?'),
    'Love the streaks',
  );
  await fireEvent.press(utils.getByRole('button', { name: 'Send Feedback' }));
  expect(mockSubmit).toHaveBeenCalledWith({
    message: 'Love the streaks',
    category: 'What’s working',
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
