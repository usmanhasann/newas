import {
  buildSteps,
  progressFor,
  showProgress,
  canGoBack,
  nextStep,
  prevStep,
  restoreStep,
  requiresAnswer,
  requiredAnswersComplete,
  type StepId,
} from '@features/onboarding/flow';
import {
  parseHhmm,
  formatHhmm12,
  shouldSkipPlanAnimation,
  PLAN_ANIMATION_MS,
  ACQUISITIONS,
  REFLECTION_STYLES,
  SUPPORTS,
} from '@features/onboarding/constants';
import {
  reflectBack,
  stressPhrase,
  goalAspiration,
  trialReminderMessage,
  trialReminderFireAt,
  valueGraphCopy,
  motivationFocus,
  overwhelmPlanLabel,
  supportPlanLabel,
  reflectionStylePhrase,
  lifeStageLabel,
  triedAppsPlanLabel,
} from '@features/onboarding/copy';
import {
  PLAN_PRICING,
  DEFAULT_PLAN,
  TRIAL_DAYS,
  priceWithPeriod,
  annualPerMonthLabel,
  formatLikePrice,
  pricesFromStore,
} from '@features/subscription/pricing';
import { readOnboarding } from '@features/onboarding/api';
import type { OnboardingData } from '@features/onboarding/types';
import type { Profile } from '@app-types/database';

describe('onboarding flow (step machine)', () => {
  it('has no email-verify step; sign-up goes straight to payment (verification is enforced at circle-join, not onboarding)', () => {
    const s = buildSteps();
    expect(s).not.toContain('emailVerify');
    // The steps are identical for every auth method now — sign-up is immediately followed by payment.
    expect(nextStep('auth', s)).toBe('trial');
  });

  it('follows the client screen order exactly, start to finish', () => {
    const s = buildSteps();
    // removed screens
    expect(s).not.toContain('checkin');
    expect(s).not.toContain('insights');
    expect(s).not.toContain('trusted');
    expect(s).not.toContain('social');
    expect(s).not.toContain('rating'); // the store-rating ask was removed from onboarding
    expect(s).not.toContain('acquisition'); // "where did you hear" is Home-only now, not a step
    // These three were removed from onboarding (client request 2026-09-10).
    expect(s).not.toContain('privacy'); // "A space that's just yours"
    expect(s).not.toContain('triedApps'); // "Have you tried any other journaling apps?"
    expect(s).not.toContain('howItWorks'); // "One quiet minute a day"

    // The client's ordered list (revised 2026-08-25), bracketed by the Welcome entry and the
    // closing commit stretch. Asserting the whole sequence rather than pairwise orderings so
    // an accidental re-shuffle can't slip through by still satisfying every relative check.
    expect(s).toEqual([
      'welcome', // 1
      'motivation', // 2  What brought you here today?
      'birthday', // 3  When is your birthday?
      'valueGraph', // 4  Steadier days, one check-in at a time
      'frequency', // 5  How often do you feel overwhelmed?
      'support', // 6  When things get hard, who do you turn to?
      'goal', // 7  What would feel like a win a month from now?
      'reflect', // 8  Thanks for sharing
      'reflectionStyle', // 9  How should your reflections sound?
      'shift', // 10 The shift you're working toward
      'circlesPrivacy', // 11 Public & Private Circles
      'firstCheckin', // 12 Let's try your first check in
      'building', // 13 You're all set (checklist, 100%)
      'auth', // 14/15 save progress + create account
      'trial', // 16 paywall
      'confirm', // 17 trial confirmation
      'notifications', // 18 notification permission (LAST; completes onboarding)
    ]);
  });

  it('keeps the ordering invariants the flow logic depends on', () => {
    const s = buildSteps();
    const at = (x: StepId) => s.indexOf(x);
    // The value graph is shown early — after the opening "what brought you here" question but
    // before the wellbeing questions it sets up.
    (['frequency', 'support', 'goal', 'reflectionStyle'] as StepId[]).forEach((q) =>
      expect(at('valueGraph')).toBeLessThan(at(q)),
    );
    expect(at('motivation')).toBeLessThan(at('valueGraph'));
    // Every answer that gates plan generation is collected before the plan is assembled,
    // so BuildingStep's §10 guard can never trip on the happy path.
    (['motivation', 'frequency', 'support', 'goal'] as StepId[]).forEach((q) =>
      expect(at(q)).toBeLessThan(at('building')),
    );
    // The reflect-back quotes the answers, so it must follow them.
    expect(at('goal')).toBeLessThan(at('reflect'));
    // Notifications are asked only after the user has felt the value (first check-in) — never a
    // cold prompt. The ask is now the FINAL step (after payment), so it also follows building/auth.
    expect(at('firstCheckin')).toBeLessThan(at('notifications'));
    expect(at('building')).toBeLessThan(at('auth'));
    expect(nextStep('firstCheckin', s)).toBe('building');
    expect(nextStep('building', s)).toBe('auth');
    expect(nextStep('notifications', s)).toBeNull(); // notifications is the last step
  });

  it('routes the informational circles-privacy screen and the tightened adjacencies', () => {
    const s = buildSteps();
    // privacy + triedApps were removed, so the value graph now flows straight to the wellbeing questions.
    expect(nextStep('valueGraph', s)).toBe('frequency');
    // howItWorks was removed, so circlesPrivacy now flows straight to the first check-in.
    expect(nextStep('shift', s)).toBe('circlesPrivacy');
    expect(nextStep('circlesPrivacy', s)).toBe('firstCheckin');
    expect(prevStep('circlesPrivacy', s)).toBe('shift');
    // circlesPrivacy is informational: it doesn't gate Continue, is resumable, and allows back.
    expect(requiresAnswer('circlesPrivacy')).toBe(false);
    expect(restoreStep('circlesPrivacy', s, false)).toBe('circlesPrivacy');
    expect(canGoBack('circlesPrivacy')).toBe(true);
  });

  it('ends with sign-up → payment → confirm → notifications, the same for every auth method (§14/§17)', () => {
    const s = buildSteps();
    expect(s[s.length - 1]).toBe('notifications'); // the closing permission ask completes onboarding
    expect(s[s.length - 2]).toBe('confirm'); // transaction result
    expect(s[s.length - 3]).toBe('trial'); // subscription = last real decision
    expect(s[s.length - 4]).toBe('auth'); // sign-up right before payment
    expect(nextStep('auth', s)).toBe('trial'); // no verify step in between
    expect(nextStep('trial', s)).toBe('confirm');
    expect(nextStep('confirm', s)).toBe('notifications');
  });

  it('renders a numberless progress line across all steps except confirm + notifications (§4/§11)', () => {
    const s = buildSteps();
    // The post-payment wrap-up (confirmation result + the closing notification ask) shows no bar.
    expect(progressFor('confirm', s)).toBeNull();
    expect(progressFor('notifications', s)).toBeNull();
    expect(showProgress('welcome', s)).toBe(true);
    const progressable = s.filter((x) => x !== 'confirm' && x !== 'notifications');
    expect(progressFor('motivation', s)).toEqual({
      index: progressable.indexOf('motivation') + 1,
      total: progressable.length,
    });
  });

  it('requires an answer on the question screens only (§5)', () => {
    (['motivation', 'frequency', 'support', 'goal'] as StepId[]).forEach((s) =>
      expect(requiresAnswer(s)).toBe(true),
    );
    // birthday is always answered (the picker has a default); reflectionStyle is a DEFAULTED
    // preference (preselected 'gentle'). Neither gates via requiresAnswer.
    (
      [
        'welcome',
        'birthday',
        'reflectionStyle',
        'valueGraph',
        'notifications',
        'reflect',
        'building',
        'shift',
        'circlesPrivacy',
        'firstCheckin',
        'auth',
        'trial',
        'confirm',
      ] as StepId[]
    ).forEach((s) => expect(requiresAnswer(s)).toBe(false));
  });

  it('gates plan generation on every required answer (§10/§20)', () => {
    expect(requiredAnswersComplete({})).toBe(false);
    // "Where did you hear about us" is Home-only now, so acquisition_source is NOT required here.
    const full: OnboardingData = {
      motivation: ['managing_stress'],
      frequency: 'sometimes', // single-select → a scalar, not an array
      support: ['close_friend'],
      goal: ['calmer'],
    };
    expect(requiredAnswersComplete(full)).toBe(true);
    // The single-select frequency gates plan generation alongside the multi-selects.
    expect(requiredAnswersComplete({ ...full, frequency: null })).toBe(false);
    // Empty-array footgun: a question deselected back to [] must NOT count as answered.
    expect(requiredAnswersComplete({ ...full, motivation: [] })).toBe(false);
    expect(requiredAnswersComplete({ ...full, support: [] })).toBe(false);
    expect(requiredAnswersComplete({ ...full, goal: [] })).toBe(false);
  });

  it('allows back navigation except on welcome, auth, trial, confirm, and notifications', () => {
    expect(canGoBack('welcome')).toBe(false);
    expect(canGoBack('confirm')).toBe(false);
    // No back once the user reaches sign-up (auth) or payment (trial).
    expect(canGoBack('auth')).toBe(false);
    expect(canGoBack('trial')).toBe(false);
    // The closing notification ask finalizes onboarding — no stepping back from it either.
    expect(canGoBack('notifications')).toBe(false);
    expect(canGoBack('firstCheckin')).toBe(true);
  });

  it('navigates forward and backward through the active steps', () => {
    const s = buildSteps();
    expect(nextStep('welcome', s)).toBe('motivation');
    expect(nextStep('motivation', s)).toBe('birthday');
    expect(nextStep('birthday', s)).toBe('valueGraph');
    // The reflect-back now comes BEFORE the tone question (client order #8 then #9).
    expect(nextStep('goal', s)).toBe('reflect');
    expect(nextStep('reflect', s)).toBe('reflectionStyle');
    expect(prevStep('reflectionStyle', s)).toBe('reflect');
    expect(prevStep('reflect', s)).toBe('goal');
    expect(prevStep('motivation', s)).toBe('welcome');
    // The flow now ends on the notification ask (after the confirmation result).
    expect(nextStep('confirm', s)).toBe('notifications');
    expect(nextStep('notifications', s)).toBeNull();
    expect(prevStep('welcome', s)).toBeNull();
  });

  it('restores a saved step, with safe clamping', () => {
    const s = buildSteps();
    expect(restoreStep('frequency', s, false)).toBe('frequency');
    expect(restoreStep(undefined, s, false)).toBe('welcome');
    expect(restoreStep('checkin', s, false)).toBe('welcome'); // removed step → start over
    expect(restoreStep('rating', s, false)).toBe('welcome'); // ditto for the removed rating ask
    // 'emailVerify' was removed — a user mid-migration who saved it safely restarts at welcome.
    expect(restoreStep('emailVerify', s, false)).toBe('welcome');
    // 'acquisition' was removed from onboarding — a saved value safely restarts at welcome.
    expect(restoreStep('acquisition', s, false)).toBe('welcome');
    // privacy / triedApps / howItWorks were removed (2026-09-10) — saved values restart at welcome.
    expect(restoreStep('privacy', s, false)).toBe('welcome');
    expect(restoreStep('triedApps', s, false)).toBe('welcome');
    expect(restoreStep('howItWorks', s, false)).toBe('welcome');
    // never show the post-payment steps (confirmation + the closing notification ask) without
    // server-confirmed access — both clamp back to the paywall.
    expect(restoreStep('confirm', s, false)).toBe('trial');
    expect(restoreStep('confirm', s, true)).toBe('confirm');
    expect(restoreStep('notifications', s, false)).toBe('trial');
    expect(restoreStep('notifications', s, true)).toBe('notifications');
  });
});

describe('onboarding constants', () => {
  it('offers the acquisition sources, with "Other" last (§8)', () => {
    expect(ACQUISITIONS.map((o) => o.value)).toEqual([
      'instagram',
      'tiktok',
      'app_store',
      'friends_family',
      'other',
    ]);
  });

  it('gives every acquisition source a leading logo/icon', () => {
    expect(ACQUISITIONS.every((o) => !!o.icon)).toBe(true);
  });

  it('offers the four personal reflection tones, gentle first (the default), each described', () => {
    expect(REFLECTION_STYLES.map((o) => o.value)).toEqual([
      'gentle',
      'direct',
      'encouraging',
      'reflective',
    ]);
    expect(REFLECTION_STYLES.every((o) => !!o.icon && !!o.description)).toBe(true);
  });

  it('parses and formats times', () => {
    expect(parseHhmm('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseHhmm('21:30:00')).toEqual({ hour: 21, minute: 30 });
    expect(parseHhmm('bad')).toBeNull();
    expect(parseHhmm('99:99')).toBeNull();
    expect(formatHhmm12('09:00')).toBe('9:00 AM');
    expect(formatHhmm12('18:00')).toBe('6:00 PM');
    expect(formatHhmm12('00:05')).toBe('12:05 AM');
  });

  it('skips the plan animation under reduced motion or when already played', () => {
    expect(shouldSkipPlanAnimation(false, false)).toBe(false);
    expect(shouldSkipPlanAnimation(true, false)).toBe(true);
    expect(shouldSkipPlanAnimation(false, true)).toBe(true);
    // Deliberately unhurried so pieces pop in + check off one at a time, readably.
    expect(PLAN_ANIMATION_MS).toBeGreaterThanOrEqual(6000);
    expect(PLAN_ANIMATION_MS).toBeLessThanOrEqual(9000);
  });
});

describe('onboarding hydration (shape normalization on read)', () => {
  const profileWith = (onboarding: unknown) =>
    ({ settings: { onboarding } }) as unknown as Profile;

  it('coerces a legacy multi-select frequency array down to the primary answer', () => {
    // `frequency` used to be multi-select. A flow interrupted under that build persisted an
    // array; hydrating it must yield the scalar the single-select screen now expects.
    expect(
      readOnboarding(profileWith({ frequency: ['most_days', 'sometimes'] })).frequency,
    ).toBe('most_days');
    // A deselected-to-empty array meant "unanswered" — it must not hydrate as a value.
    expect(readOnboarding(profileWith({ frequency: [] })).frequency).toBeNull();
    // Already-scalar data passes through untouched.
    expect(readOnboarding(profileWith({ frequency: 'rarely' })).frequency).toBe('rarely');
  });

  it('still coerces legacy scalars UP to arrays for the multi-select answers', () => {
    const d = readOnboarding(
      profileWith({ motivation: 'managing_stress', goal: 'calmer' }),
    );
    expect(d.motivation).toEqual(['managing_stress']);
    expect(d.goal).toEqual(['calmer']);
  });
});

describe('onboarding copy (personalization)', () => {
  it('builds a grammatical reflect-back with the fixed support clause, no raw enum values', () => {
    const text = reflectBack('sometimes', 'calmer', 'close_friend');
    expect(text).toBe(
      "Thanks for sharing. You're navigating stress that comes and goes and you'd love to " +
        'feel calmer. LYSM is built for exactly this: small daily check-ins that help ' +
        "you see what's really going on. " +
        'You lean on a close friend when things get hard. LYSM can be another layer of support alongside that.',
    );
    expect(text).not.toMatch(/_/);
    expect(text).not.toContain('sometimes');
    expect(text).not.toContain('close_friend');
    // Multi-select answers arrive as arrays; the copy uses the PRIMARY (first) value.
    expect(
      reflectBack(
        ['sometimes', 'almost_always'],
        ['calmer', 'patterns'],
        ['close_friend', 'family'],
      ),
    ).toBe(text);
  });

  it('appends the EXACT fixed support clause for each "who do you turn to" answer; omits it when absent', () => {
    expect(reflectBack('sometimes', 'calmer', 'close_friend')).toContain(
      'You lean on a close friend when things get hard. LYSM can be another layer of support alongside that.',
    );
    expect(reflectBack('sometimes', 'calmer', 'family')).toContain(
      'You lean on family when things get hard. LYSM can be another layer of support alongside that.',
    );
    expect(reflectBack('sometimes', 'calmer', 'partner')).toContain(
      'You lean on a partner when things get hard. LYSM can be another layer of support alongside that.',
    );
    expect(reflectBack('sometimes', 'calmer', 'keep_to_myself')).toContain(
      "You said you tend to keep things to yourself, and that's exactly what this space is for.",
    );
    expect(reflectBack('sometimes', 'calmer', 'not_sure')).toContain(
      "You're still figuring out who you turn to. That's okay too, and this space can help either way.",
    );
    // Every support option adds a distinct sentence — none falls through to a missing clause.
    SUPPORTS.forEach((o) =>
      expect(reflectBack('sometimes', 'calmer', o.value)).not.toBe(
        reflectBack('sometimes', 'calmer', null),
      ),
    );
    // No support answer → just the opener (defensive; support is required on the real screen).
    expect(reflectBack('sometimes', 'calmer', null)).toBe(
      "Thanks for sharing. You're navigating stress that comes and goes and you'd love to " +
        'feel calmer. LYSM is built for exactly this: small daily check-ins that help ' +
        "you see what's really going on.",
    );
  });

  it('has natural phrases for every frequency and goal', () => {
    (['rarely', 'sometimes', 'most_days', 'almost_always'] as const).forEach((f) =>
      expect(stressPhrase(f).length).toBeGreaterThan(0),
    );
    (
      ['calmer', 'patterns', 'daily_habit', 'less_alone', 'more_good_days'] as const
    ).forEach((g) => expect(goalAspiration(g).length).toBeGreaterThan(0));
    expect(reflectBack(null, null)).toContain('Thanks for sharing.');
  });

  it('shows the fixed value-graph title, illustratively (§7)', () => {
    // The graph now appears BEFORE the questions, so its copy is fixed (not motivation-based).
    const copy = valueGraphCopy();
    expect(copy.title).toBe('Steadier days, one check-in at a time');
    expect(copy.withLabel).toBe('With LYSM');
    expect(copy.withoutLabel).toBe('Without LYSM');
    // motivational / illustrative — never a guarantee or medical claim
    expect(copy.caption.toLowerCase()).toContain('not a guarantee');
    // motivationFocus still powers the plan-building copy and takes the primary answer.
    expect(motivationFocus('managing_stress')).toBe('managing stress');
    expect(motivationFocus(['understanding_myself', 'managing_stress'])).toBe(
      'understanding yourself',
    );
    expect(motivationFocus(null)).toBe('your wellbeing');
  });

  it('builds the trial reminder: the client’s exact title, then renewal date, price, and how to cancel', () => {
    const { title, body } = trialReminderMessage({
      priceLabel: '$29.99/year',
      renewalDateLabel: 'Jun 27, 2026',
    });
    // Client 10/14 p.36: exact sentence, period included.
    expect(title).toBe('Your free trial ends in 2 days.');
    expect(body).toBe(
      'Your plan renews on Jun 27, 2026 at $29.99/year unless you cancel. ' +
        'You can cancel anytime in Profile → Subscription.',
    );
  });

  it('fires the reminder 2 days before the trial ends: the paywall’s "Day 3" (audit 2026-09-30)', () => {
    const ends = Date.parse('2026-06-27T09:00:00.000Z'); // a 5-day trial started Jun 22
    expect(trialReminderFireAt(ends)).toBe(Date.parse('2026-06-25T09:00:00.000Z'));
  });

  it('personalizes the plan checklist from the real answers (support, style, life stage, apps)', () => {
    // "Who do you turn to" — every option reads naturally, including keeping to yourself.
    expect(supportPlanLabel(['close_friend'])).toBe(
      'Keeping the friend you lean on close',
    );
    expect(supportPlanLabel(['keep_to_myself'])).toBe(
      'A private space that’s just for you',
    );
    expect(supportPlanLabel(null)).toBe('Room for the people you trust'); // safe fallback
    SUPPORTS.forEach((s) =>
      expect(supportPlanLabel([s.value]).length).toBeGreaterThan(0),
    );

    // "How often overwhelmed" → a plan row phrased around OVERWHELM, never "stress" — so it can't
    // repeat a stress-based motivation row ("Focusing on managing stress"). Distinct per frequency.
    expect(overwhelmPlanLabel('sometimes')).toBe(
      'Steadying the days that overwhelm you now and then',
    );
    expect(overwhelmPlanLabel('almost_always')).toBe(
      'Steadying the days that so often overwhelm you',
    );
    (['rarely', 'sometimes', 'most_days', 'almost_always'] as const).forEach((f) =>
      expect(overwhelmPlanLabel(f)).not.toMatch(/stress/i),
    );
    expect(overwhelmPlanLabel(null).length).toBeGreaterThan(0);

    // "How should your reflections sound" — the chosen styles as words in the sentence (no capitals,
    // no "&"), up to two, DB-default when unset (client 10/14 p.11-12).
    expect(reflectionStylePhrase(['gentle'])).toBe('gentle');
    expect(reflectionStylePhrase(['gentle', 'direct'])).toBe('gentle and direct');
    expect(reflectionStylePhrase([])).toBe('gentle'); // default, never an empty row
    expect(reflectionStylePhrase(null)).toBe('gentle');
    // Words come from the single REFLECTION_STYLES source, so they never drift from the picker.
    REFLECTION_STYLES.forEach((o) =>
      expect(reflectionStylePhrase([o.value])).toBe(o.label.toLowerCase()),
    );

    // Life stage from age (birthday) — decade phrasing, with safe edges.
    expect(lifeStageLabel(34)).toBe('your 30s');
    expect(lifeStageLabel(20)).toBe('your 20s');
    expect(lifeStageLabel(19)).toBe('your late teens');
    expect(lifeStageLabel(null)).toBe('your stage of life');

    // Tried other apps → build on it vs. a fresh start (null = neutral, non-empty).
    expect(triedAppsPlanLabel(true)).toBe('Building on what you’ve tried before');
    expect(triedAppsPlanLabel(false)).toBe('A fresh start, built around you');
    expect(triedAppsPlanLabel(null).length).toBeGreaterThan(0);
  });
});

describe('subscription pricing (single source)', () => {
  it('uses the spec prices with annual as default', () => {
    expect(DEFAULT_PLAN).toBe('yearly');
    expect(TRIAL_DAYS).toBe(5);
    expect(PLAN_PRICING.yearly.priceLabel).toBe('$29.99');
    expect(PLAN_PRICING.yearly.period).toBe('year');
    expect(PLAN_PRICING.yearly.tagline).toMatch(/Best value/i);
    expect(PLAN_PRICING.monthly.priceLabel).toBe('$4.99');
    expect(PLAN_PRICING.monthly.period).toBe('month');
  });

  it('writes price + interval, and the annual plan per month (annual ÷ 12, client p.36)', () => {
    expect(priceWithPeriod('yearly')).toBe('$29.99/year');
    expect(priceWithPeriod('monthly')).toBe('$4.99/month');
    expect(annualPerMonthLabel()).toBe('$2.50');
  });

  it('uses the stores’ own prices, in the person’s currency, once they answer (client p.36)', () => {
    const eur = pricesFromStore({
      yearly: { priceLabel: '29,99 €', amount: 29.99, currency: 'EUR' },
      monthly: { priceLabel: '4,99 €', amount: 4.99, currency: 'EUR' },
    });
    expect(priceWithPeriod('yearly', eur)).toBe('29,99 €/year');
    expect(annualPerMonthLabel(eur)).toBe('2,50 €');
    // Missing a plan, or two currencies: the defaults for both (never a mixed card).
    expect(pricesFromStore(null)).toBe(PLAN_PRICING);
    expect(
      pricesFromStore({
        yearly: { priceLabel: '29,99 €', amount: 29.99, currency: 'EUR' },
      }),
    ).toBe(PLAN_PRICING);
    expect(
      pricesFromStore({
        yearly: { priceLabel: '29,99 €', amount: 29.99, currency: 'EUR' },
        monthly: { priceLabel: '$4.99', amount: 4.99, currency: 'USD' },
      }),
    ).toBe(PLAN_PRICING);
  });

  it('writes amounts the app works out exactly like the store writes its own', () => {
    expect(formatLikePrice('$4.99', 59.88)).toBe('$59.88');
    expect(formatLikePrice('4,99 €', 59.88)).toBe('59,88 €');
    expect(formatLikePrice('¥600', 7200)).toBe('¥7,200');
    expect(formatLikePrice('₩5,900', 70800)).toBe('₩70,800');
    expect(formatLikePrice('R$ 1.234,56', 14814.72)).toBe('R$ 14.814,72');
    expect(formatLikePrice('CHF 5.00', 60)).toBe('CHF 60.00');
    expect(formatLikePrice('£4.49', 4.49 * 12)).toBe('£53.88');
    expect(formatLikePrice('₹349', 349 * 12)).toBe('₹4,188');
    expect(formatLikePrice('no number', 5)).toBe('no number');
  });
});
