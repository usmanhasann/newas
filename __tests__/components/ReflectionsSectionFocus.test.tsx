/**
 * Reflections are only asked for while Insights is on screen (final check 2026-10-06): the 9 AM
 * recap push skips a period whose reflection already exists, and the Insights tab stays mounted, so
 * writing the reflection in the background on a new day cancelled the push for people who never
 * opened Insights. Unfocused → nothing; focused → asked once for the day.
 * One render per file (React 19 leaks across sibling renders).
 */
import { act, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { ReflectionsSection } from '@features/reflections/components/ReflectionsSection';

const mockGenerate = jest.fn();
jest.mock('@features/reflections/hooks', () => ({
  useReflectionsOverview: () => ({
    isLoading: false,
    isError: false,
    data: [
      { type: 'weekly', hasAnyEntry: true, content: 'A calm week.', nextUnlockDate: '2026-10-12', generating: false, failed: false },
    ],
  }),
  useGenerateReflections: () => ({ mutate: mockGenerate, isPending: false }),
}));
jest.mock('@features/reflections/components/ReflectionCard', () => ({ ReflectionCard: () => null }));

it('asks for the day’s reflections only once Insights is on screen', async () => {
  const listeners: Record<string, () => void> = {};
  const navigation = {
    isFocused: () => false,
    addListener: (event: string, cb: () => void) => {
      listeners[event] = cb;
      return () => undefined;
    },
  };
  await render(
    <NavigationContext.Provider value={navigation as never}>
      <ReflectionsSection type="weekly" today="2026-10-06" />
    </NavigationContext.Provider>,
  );
  expect(mockGenerate).not.toHaveBeenCalled(); // app reopened on another tab: nothing in the background

  await act(async () => {
    listeners.focus?.();
  });
  expect(mockGenerate).toHaveBeenCalledTimes(1);

  // Leaving and coming back the same day asks nothing more.
  await act(async () => {
    listeners.blur?.();
  });
  await act(async () => {
    listeners.focus?.();
  });
  expect(mockGenerate).toHaveBeenCalledTimes(1);
});
