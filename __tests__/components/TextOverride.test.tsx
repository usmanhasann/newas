/**
 * Integration guard for the NativeWind class-order fix: <Text> itself must hand the host the
 * resolved classes (not `variant + className` stacked), or overrides silently lose on device —
 * e.g. the paywall price rendered at 15px. See __tests__/typographyClasses.test.ts.
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { Text } from '@components';

async function hostClasses(ui: ReactElement, text: string): Promise<string[]> {
  const { getByText } = await render(ui);
  return String(getByText(text).props.className).split(/\s+/);
}

describe('<Text> applies caller overrides', () => {
  it('meta + text-lg renders text-lg, not the variant text-xs', async () => {
    const c = await hostClasses(
      <Text variant="meta" className="text-lg">
        note
      </Text>,
      'note',
    );
    expect(c).toContain('text-lg');
    expect(c).not.toContain('text-xs');
  });

  it('paywall price: bodyStrong + text-6xl drops the variant text-base', async () => {
    const c = await hostClasses(
      <Text variant="bodyStrong" className="text-6xl">
        $2.50
      </Text>,
      '$2.50',
    );
    expect(c).toContain('text-6xl');
    expect(c).not.toContain('text-base');
  });

  it('default body variant + colour override drops text-ink', async () => {
    const c = await hostClasses(<Text className="text-danger-strong">oops</Text>, 'oops');
    expect(c).toContain('text-danger-strong');
    expect(c).not.toContain('text-ink');
  });
});
