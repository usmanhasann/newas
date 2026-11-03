/**
 * Onboarding step machine — pure logic so navigation, the progress line, and resume
 * behavior are all unit-testable without rendering.
 *
 * Order rationale (client screen ordering): open with "what brought you here", then the birthday
 * age-gate and the value graph, THEN the wellbeing questions (how often overwhelmed / who you turn
 * to / your goal), the reflect-back synthesis, and the tone preference. The value stretch follows
 * (shift → circles/privacy), then the first check-in and the personalized-plan recap ("You're all
 * set"). We close with sign-up → paywall → trial confirmation → the notification permission ask
 * (LAST), which is the step that COMPLETES onboarding. "Where did you hear about us?" is NOT in
 * onboarding — it's an optional one-time popup on Home.
 *
 * Email verification is NOT a separate step: on the email sign-up path the auth step itself shows
 * the 6-digit code right after Create Account and only moves on to the paywall once the email is
 * verified (client revisions 10/14 p.18, see AuthStep), so the step list stays the same for every
 * sign-in method and the screens after the paywall stay the two that exist.
 */
import type { OnboardingData } from './types';

export type StepId =
  | 'welcome'
  | 'birthday' // date of birth (age gate)
  | 'valueGraph'
  | 'motivation'
  | 'frequency'
  | 'support'
  | 'goal'
  | 'reflectionStyle'
  | 'notifications'
  | 'reflect'
  | 'building'
  | 'shift'
  | 'circlesPrivacy' // "Two ways to open up." — private vs public circles
  | 'firstCheckin'
  | 'auth'
  | 'trial' // subscription / paywall (last decision)
  | 'confirm'; // transaction result

// Client-specified screen order. The numbered comments are the client's own list (1–17); the
// unnumbered steps are the structural ones they didn't enumerate: the Welcome entry and the
// closing commit stretch (sign-up → verify → payment → result).
const BASE_ORDER: StepId[] = [
  'welcome', // 1
  'motivation', // 2 — "what brought you here today"
  'birthday', // 3 — age gate (18+)
  'valueGraph', // 4 — "steadier days" motivational chart
  'frequency', // 5 — how often overwhelmed
  'support', // 6 — who you turn to when things get hard
  'goal', // 7 — a win a month from now
  'reflect', // 8 — "Thanks for sharing" synthesis
  'reflectionStyle', // 9 — how should your reflections sound
  'shift', // 10 — the shift you're working toward
  'circlesPrivacy', // 11 — private by default, open by choice
  'firstCheckin', // 12
  'building', // 13 — "You're all set" recap checklist (100%)
  'auth', // 14/15 — save your progress + create account
  'trial', // 16 — paywall
  'confirm', // 17 — trial confirmation
  'notifications', // 18 — notification permission ask (LAST; completes onboarding)
];

/** The ordered step list — identical for every auth method (the email code is part of 'auth'). */
export function buildSteps(): StepId[] {
  return BASE_ORDER;
}

/**
 * Steps that require a selection before "Continue" is enabled (spec §5). These are the
 * single-choice question screens; other steps gate their own CTA (a mood on the first
 * check-in, an auth method, a plan, etc.).
 */
const REQUIRED: StepId[] = ['motivation', 'frequency', 'support', 'goal'];
export function requiresAnswer(step: StepId): boolean {
  return REQUIRED.includes(step);
}

/**
 * Whether every required onboarding answer exists (spec §10/§20). Plan generation must
 * not start until this is true. The multi-select answers are arrays (up to two choices), so
 * we check for a NON-EMPTY array — an empty `[]` is truthy in JS and must not pass. The
 * single-select answer (frequency) is a scalar, so truthiness is enough.
 */
export function requiredAnswersComplete(data: OnboardingData): boolean {
  const hasItems = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
  return (
    hasItems(data.motivation) &&
    hasItems(data.support) &&
    hasItems(data.goal) &&
    !!data.frequency
  );
}

/**
 * Progress-line position within the ACTIVE flow (spec §4/§11). No numeric label is
 * shown — the line represents progress. The terminal confirmation screen has no bar
 * (it's a result, not a step), so it's excluded from both the index and the total.
 */
export function progressFor(
  step: StepId,
  steps: StepId[] = buildSteps(),
): { index: number; total: number } | null {
  // The post-payment finalization screens (trial confirmation + the notification ask) show no
  // progress line — they're the wrap-up, not "onboarding questions".
  if (step === 'confirm' || step === 'notifications') return null;
  const progressable = steps.filter((s) => s !== 'confirm' && s !== 'notifications');
  const idx = progressable.indexOf(step);
  if (idx < 0) return null;
  return { index: idx + 1, total: progressable.length };
}

export function showProgress(step: StepId, steps: StepId[] = buildSteps()): boolean {
  return progressFor(step, steps) !== null;
}

/**
 * Back is disabled at the entry (welcome), across the commit stretch (auth sign-up + trial /
 * payment — once the user creates an account and reaches payment they can't step back), and on
 * the post-payment finalization (confirmation result + the closing notification ask). It's
 * allowed on every other step.
 */
export function canGoBack(step: StepId): boolean {
  return (
    step !== 'welcome' &&
    step !== 'auth' &&
    step !== 'trial' &&
    step !== 'confirm' &&
    step !== 'notifications'
  );
}

/**
 * Whether a saved step is past sign-up (the paywall or later). An email + password account that
 * reached it without verifying (accounts from before the email code existed) is asked to verify
 * before going on (client revisions 10/14 p.18, see navigation/gate.ts).
 */
export function isPastAuth(step: string | null | undefined, steps: StepId[] = buildSteps()): boolean {
  const i = steps.indexOf(step as StepId);
  return i >= 0 && i > steps.indexOf('auth');
}

export function nextStep(current: StepId, steps: StepId[] = buildSteps()): StepId | null {
  const i = steps.indexOf(current);
  if (i < 0 || i >= steps.length - 1) return null;
  return steps[i + 1];
}

export function prevStep(current: StepId, steps: StepId[] = buildSteps()): StepId | null {
  const i = steps.indexOf(current);
  if (i <= 0) return null;
  return steps[i - 1];
}

/**
 * Where to resume after an interruption. Clamps to a safe step:
 * - unknown/omitted step → start over at 'welcome'
 * - saved 'confirm'/'notifications' but access not yet server-confirmed → back to 'trial' (these
 *   post-payment steps must never show without an active trial/subscription).
 */
export function restoreStep(
  saved: string | null | undefined,
  steps: StepId[] = buildSteps(),
  hasAccess = false,
): StepId {
  const candidate = saved as StepId | undefined;
  if (!candidate || !steps.includes(candidate)) return 'welcome';
  if ((candidate === 'confirm' || candidate === 'notifications') && !hasAccess) return 'trial';
  return candidate;
}
