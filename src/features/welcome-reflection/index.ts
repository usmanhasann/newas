/**
 * The "Welcome reflection" (client revisions 10/14 p.33 to p.35, N15): the first reflection written
 * from the onboarding answers. The Journal tab shows <WelcomeReflectionCard /> at the top of its
 * list; the first check in starts it on "Skip for now" (useStartWelcomeReflection); the paywall
 * reads and retries it.
 */
export { WelcomeReflectionCard } from './components/WelcomeReflectionCard';
export {
  useWelcomeReflection,
  useRequestWelcomeReflection,
  useStartWelcomeReflection,
} from './hooks';
export type { WelcomeReflection, WelcomeReflectionStatus } from './api';
