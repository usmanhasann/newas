/**
 * Client revisions 10/14, p.29: the Create Circle description stops at 150 characters, with a live
 * counter right below the box (0/150, 45/150, and so on) styled like the profile bio's counter
 * (small gray caption, right-aligned).
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { CreateCircleScreen } from '@features/circles/screens/CreateCircleScreen';

jest.mock('@features/circles/hooks', () => ({
  useCreateCircle: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

it('Public description: capped at 150 with a live "[count]/150" counter', async () => {
  const navigation = { goBack: jest.fn(), replace: jest.fn() };
  const utils = await render(
    <CreateCircleScreen navigation={navigation as never} route={{} as never} />,
  );

  await fireEvent.press(utils.getByText('Public'));
  const field = utils.getByPlaceholderText('What’s this circle about?');
  expect(field.props.maxLength).toBe(150);

  const counter = utils.getByText('0/150');
  expect(String(counter.props.className)).toContain('text-xs');
  expect(String(counter.props.className)).toContain('text-ink-soft');
  expect(String(counter.props.className)).toContain('text-right');
  expect(counter.props.accessibilityLabel).toBe('0 of 150 characters used');
  // The hint stays, next to the counter.
  expect(utils.getByText('Shown when people discover public circles')).toBeTruthy();

  await fireEvent.changeText(field, 'x'.repeat(45));
  expect(utils.getByText('45/150')).toBeTruthy();
  expect(utils.queryByText('0/150')).toBeNull();

  await fireEvent.changeText(field, 'y'.repeat(150));
  expect(utils.getByText('150/150')).toBeTruthy();
});
