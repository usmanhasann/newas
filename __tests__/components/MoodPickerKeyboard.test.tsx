/**
 * Client 10/14 p.7 (O4.08): on the first check-in, ANY tap on a mood closes the keyboard: a mood
 * that is picked or removed (onInteract runs before the change), and a mood that can't be added
 * because three are already picked (the toast shows, nothing changes). The mood row gets
 * keyboardShouldPersistTaps="handled" so that one tap reaches the mood while the keyboard is open.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render } from '@testing-library/react-native';
import { MoodPicker } from '@features/moods';

// The props of the first horizontal scroll view (the mood row); RNTL 14 has no UNSAFE_ queries.
type JsonNode = { props?: Record<string, unknown>; children?: unknown[] | null };

function findHorizontalScroll(tree: unknown): Record<string, unknown> | undefined {
  const nodes: unknown[] = Array.isArray(tree) ? [...tree] : [tree];
  while (nodes.length) {
    const node = nodes.shift() as JsonNode | string | null;
    if (!node || typeof node !== 'object') continue;
    if (node.props?.horizontal === true) return node.props;
    nodes.push(...(node.children ?? []));
  }
  return undefined;
}

it('runs onInteract on every mood tap, before the change, and forwards the tap setting', async () => {
  const onChange = jest.fn();
  const onInteract = jest.fn();
  const utils = await render(
    <MoodPicker
      value={['happy', 'sad', 'calm']}
      onChange={onChange}
      onInteract={onInteract}
      keyboardShouldPersistTaps="handled"
    />,
  );
  expect(findHorizontalScroll(utils.toJSON())?.keyboardShouldPersistTaps).toBe('handled');

  // At the 3-mood cap: a 4th mood can't be added, but the tap still closes the keyboard.
  await fireEvent.press(utils.getByLabelText('Angry'));
  expect(onInteract).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();

  // Removing a picked mood: onInteract first, then the change.
  await fireEvent.press(utils.getByLabelText('Happy'));
  expect(onInteract).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenCalledWith(['sad', 'calm']);
  expect(onInteract.mock.invocationCallOrder[1]).toBeLessThan(onChange.mock.invocationCallOrder[0]!);
});
