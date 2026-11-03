/**
 * "Created by [Name]" + the verified badge (client revisions 10/14 p.5, N7.17 / N7.18): the line a
 * Public circle owned by a verified person shows on Discover, and the header of a circle a verified
 * person owns. The badge comes right after the name; with no name there is no line at all.
 * One render per file (React 19 concurrent renders leak across sibling tests): both cases render
 * together.
 */
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { CircleOwnerByline } from '@features/circles/components/CircleOwnerByline';

it('names the verified owner with the badge right after the name, or shows nothing', async () => {
  const utils = await render(
    <View>
      <CircleOwnerByline name=" Taylor Star " className="mt-1" />
      <CircleOwnerByline name={null} />
      <CircleOwnerByline name="   " />
    </View>,
  );

  const lines = utils.getAllByTestId('circle-owner-byline');
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  const badge = utils.getByLabelText('Verified');
  expect(line.children).toEqual(['Created by Taylor Star ', badge]);
  expect(badge.props.size).toBe(12); // the caption's size (xs)
  expect(line.props.accessibilityLabel).toBe('Created by Taylor Star, verified');
  expect(String(line.props.className).split(' ')).toContain('mt-1');
});
