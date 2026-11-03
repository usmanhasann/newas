/**
 * Every other mood row (Home, New Entry, Edit Entry) keeps React Native's default keyboard tap
 * behavior: the first-check-in setting is opt-in only (client 10/14 p.7 is about that screen).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
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

it('leaves the mood row tap setting unset by default', async () => {
  const utils = await render(<MoodPicker value={[]} onChange={jest.fn()} />);
  const row = findHorizontalScroll(utils.toJSON());
  expect(row).toBeDefined();
  expect(row?.keyboardShouldPersistTaps).toBeUndefined();
});
