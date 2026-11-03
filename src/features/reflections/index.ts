/**
 * Public surface of the reflections feature — Weekly/Monthly/Yearly AI reflections
 * (build task §7) and the next-unlock date (§8).
 */
export { ReflectionsSection } from './components/ReflectionsSection';
export { ReflectionCard } from './components/ReflectionCard';
export { useReflectionsOverview, useGenerateReflections, reflectionKeys } from './hooks';
export type { ReflectionOverview } from './api';
export {
  REFLECTION_TYPES,
  REFLECTION_TITLE,
  REFLECTION_PLACEHOLDER,
  reflectionCardState,
  nextUnlockSentence,
  readyOnSentence,
} from './logic';
export type { ReflectionCardState } from './logic';
