/**
 * In-memory working state for the onboarding flow. The BACKEND
 * (profiles.settings.onboarding + subscriptions) remains the source of truth; this
 * store is hydrated from it once on entry and keeps the user's selections while they
 * move forward/back, so answers are preserved without a round-trip on every render.
 * Each step also persists its answer to the backend (see hooks) for resume.
 */
import { create } from 'zustand';
import type { StepId } from '@features/onboarding/flow';
import type { OnboardingData } from '@features/onboarding/types';

interface OnboardingStore {
  hydrated: boolean;
  step: StepId;
  data: OnboardingData;
  /** Ephemeral (session-only): the Screen 8 personalization already played. */
  planAnimationPlayed: boolean;

  hydrate: (data: OnboardingData, step: StepId) => void;
  setStep: (step: StepId) => void;
  patch: (p: Partial<OnboardingData>) => void;
  markPlanAnimationPlayed: () => void;
  reset: () => void;
}

const INITIAL: Pick<OnboardingStore, 'hydrated' | 'step' | 'data' | 'planAnimationPlayed'> = {
  hydrated: false,
  step: 'welcome',
  data: {},
  planAnimationPlayed: false,
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...INITIAL,
  hydrate: (data, step) => set({ hydrated: true, data, step }),
  setStep: (step) => set({ step }),
  patch: (p) => set((s) => ({ data: { ...s.data, ...p } })),
  markPlanAnimationPlayed: () => set({ planAnimationPlayed: true }),
  reset: () => set({ ...INITIAL }),
}));
