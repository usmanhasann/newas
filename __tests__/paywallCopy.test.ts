/**
 * The words and numbers on the two new paywalls (client revisions 10/14 p.32 to p.37, N15 + N16):
 * every "Exact text" line of the ledger, the balanced two-line header, the plan card prices (all read
 * from the pricing module, never written in the paywall), and the button per plan and eligibility.
 */
import {
  CHOOSE_YOUR_PLAN,
  FAILED_TO_LOAD,
  LABEL_BASED_ON_ANSWERS,
  LABEL_WRITTEN_FOR_YOU,
  MAIN_BENEFITS,
  PILL_START_TRIAL,
  PILL_SUBSCRIBE,
  PLAN_NAME,
  TRIAL_TIMELINE,
  TRY_AGAIN,
  WRITING_REFLECTION,
  annualCrossedOutLabel,
  annualPerMonthShortLabel,
  annualSavingsPercent,
  balancedTwoLines,
  bestValueTag,
  lastEntryLabel,
  mainPaywallHeader,
  paywallButtonLabel,
  paywallButtonNote,
  planPriceLabel,
  planSubline,
  splitFirstLine,
  splitFirstSentence,
  startsTrial,
  trialOffered,
  welcomeBackBenefits,
  welcomeBackHeader,
} from '@features/subscription/paywallCopy';
import {
  PLAN_PRICING,
  annualPerMonthLabel,
  pricesFromStore,
} from '@features/subscription/pricing';

const DASH = /[–—‒―]|\s-\s/;

describe('headers', () => {
  it('main paywall: "[First name], your reflection is waiting" (N15.12)', () => {
    expect(mainPaywallHeader('Konah')).toBe('Konah, your reflection is waiting');
    expect(mainPaywallHeader(null)).toBe('Your reflection is waiting');
    expect(mainPaywallHeader('  ')).toBe('Your reflection is waiting');
  });

  it('Welcome back: "[First name], welcome back" (N16.03)', () => {
    expect(welcomeBackHeader('Konah')).toBe('Konah, welcome back');
    expect(welcomeBackHeader(undefined)).toBe('Welcome back');
  });

  it('splits evenly over two lines, like the mock: "Konah, your / reflection is waiting" (N15.14, N15.83)', () => {
    expect(balancedTwoLines('Konah, your reflection is waiting', 2)).toBe(
      'Konah, your\nreflection is waiting',
    );
    expect(balancedTwoLines('Al, your reflection is waiting', 2)).toBe(
      'Al, your reflection\nis waiting',
    );
  });

  it('never leaves the name alone on a line, however long or short it is (N15.14)', () => {
    for (const name of [
      'Al',
      'Jo',
      'Konah',
      'Maximilian',
      'Bartholomew-Alexander',
      'Wolfeschlegelsteinhausen',
    ]) {
      const [first, second] = balancedTwoLines(mainPaywallHeader(name), 2).split('\n');
      expect(first).not.toBe(`${name},`); // the name never stands alone
      expect(second).toBeTruthy();
      expect(`${first} ${second}`).toBe(mainPaywallHeader(name));
    }
    // Without the rule, the most even split of a very long name would leave it alone.
    expect(
      balancedTwoLines(mainPaywallHeader('Wolfeschlegelsteinhausen')).split('\n')[0],
    ).toBe('Wolfeschlegelsteinhausen,');
    expect(balancedTwoLines('Waiting', 2)).toBe('Waiting');
    expect(balancedTwoLines('Two words', 2)).toBe('Two\nwords');
  });
});

describe('the purple card', () => {
  it('labels, pills and states are the client’s exact text', () => {
    expect(LABEL_WRITTEN_FOR_YOU).toBe('WRITTEN FOR YOU'); // N15.17
    expect(LABEL_BASED_ON_ANSWERS).toBe('BASED ON YOUR ANSWERS'); // N15.18
    expect(PILL_START_TRIAL).toBe('Start your trial to read the rest'); // N15.22
    expect(PILL_SUBSCRIBE).toBe('Subscribe to open your journal.'); // N16.07 (the PDF's period)
    expect(WRITING_REFLECTION).toBe('Writing your reflection...'); // N15.64
    expect(FAILED_TO_LOAD).toBe('Failed to load'); // N15.67
    expect(TRY_AGAIN).toBe('Try again'); // N15.68
  });

  it('"YOUR LAST ENTRY · SEP 30": the entry’s own day, uppercase, no year (N16.04, N16.32)', () => {
    expect(lastEntryLabel('2026-09-30')).toBe('YOUR LAST ENTRY · SEP 30');
    expect(lastEntryLabel('2026-01-05')).toBe('YOUR LAST ENTRY · JAN 5');
    expect(lastEntryLabel(null)).toBe('YOUR LAST ENTRY');
  });

  it('the first sentence is readable, the rest is blurred (N15.19, N15.20)', () => {
    expect(
      splitFirstSentence(
        'You checked in today feeling calm. There is something steady here. It matters.',
      ),
    ).toEqual({
      first: 'You checked in today feeling calm.',
      rest: 'There is something steady here. It matters.',
    });
    // Closing quotes stay with their sentence; AI text is cleaned of dashes like everywhere else.
    expect(splitFirstSentence('I said “enough.” Then I rested — finally.')).toEqual({
      first: 'I said “enough.”',
      rest: 'Then I rested, finally.',
    });
    expect(splitFirstSentence('One sentence only.')).toEqual({
      first: 'One sentence only.',
      rest: '',
    });
    expect(splitFirstSentence(null)).toEqual({ first: '', rest: '' });
  });

  it('Welcome back: the first laid-out line is readable; until it is measured, all of it is blurred (N16.06, N16.33)', () => {
    const note =
      'Today felt lighter than last week. I finally said what I had been holding in.';
    expect(splitFirstLine(note, null)).toEqual({ first: '', rest: note });
    expect(
      splitFirstLine(note, [
        'Today felt lighter than last week. I ',
        'finally said what I had been holding in.',
      ]),
    ).toEqual({
      first: 'Today felt lighter than last week. I',
      rest: 'finally said what I had been holding in.',
    });
    // A one-line entry has nothing to blur.
    expect(splitFirstLine('Short day.', ['Short day.'])).toEqual({
      first: 'Short day.',
      rest: '',
    });
    // Lines that don't belong to this text (an older layout) never reveal anything.
    expect(splitFirstLine(note, ['Something else'])).toEqual({ first: '', rest: note });
  });
});

describe('checkmark lines', () => {
  it('main paywall (N15.24 to N15.26)', () => {
    expect(MAIN_BENEFITS).toEqual([
      'Understand your moods week by week',
      'Reflections written in the tone you chose',
      'Share with the people you trust',
    ]);
  });

  it('Welcome back, with the entry count in numerals (N16.11 to N16.13, N16.35)', () => {
    expect(welcomeBackBenefits(14)).toEqual([
      'All 14 of your entries, right where you left them',
      'New reflections in the tone you chose',
      'Your circles and the people in them',
    ]);
    expect(welcomeBackBenefits(1)[0]).toBe('Your 1 entry, right where you left it');
    expect(welcomeBackBenefits(0)[0]).toBe('Your journal, right where you left it');
    expect(welcomeBackBenefits(undefined)[0]).toBe(
      'Your journal, right where you left it',
    );
  });

  it('"CHOOSE YOUR PLAN" (N16.14)', () => {
    expect(CHOOSE_YOUR_PLAN).toBe('CHOOSE YOUR PLAN');
  });
});

describe('plan cards', () => {
  it('names are "Annual" and "Monthly" (N15.99 to N15.101)', () => {
    expect(PLAN_NAME).toEqual({ yearly: 'Annual', monthly: 'Monthly' });
  });

  it('prices read like the mock: $29.99/yr, $59.88 crossed out, $2.50/mo, and $4.99/mo (N15.34 to N15.36, N15.40)', () => {
    expect(planPriceLabel('yearly')).toBe('$29.99/yr');
    expect(planPriceLabel('monthly')).toBe('$4.99/mo');
    expect(annualCrossedOutLabel()).toBe('$59.88');
    expect(annualPerMonthShortLabel()).toBe('$2.50/mo');
    expect(annualPerMonthLabel()).toBe('$2.50'); // the pricing module's own per-month value
  });

  it('"Best value · Save 50%" (N15.30), computed from the two prices', () => {
    expect(annualSavingsPercent()).toBe(50);
    expect(bestValueTag()).toBe('Best value · Save 50%');
  });

  it('the stores’ prices replace the defaults on the card, in the person’s own currency (N17.01 to N17.04)', () => {
    const eur = pricesFromStore({
      yearly: { priceLabel: '29,99 €', amount: 29.99, currency: 'EUR' },
      monthly: { priceLabel: '4,99 €', amount: 4.99, currency: 'EUR' },
    });
    expect(planPriceLabel('yearly', eur)).toBe('29,99 €/yr');
    expect(planPriceLabel('monthly', eur)).toBe('4,99 €/mo');
    expect(annualCrossedOutLabel(eur)).toBe('59,88 €'); // monthly × 12
    expect(annualPerMonthShortLabel(eur)).toBe('2,50 €/mo'); // annual ÷ 12
    expect(bestValueTag(eur)).toBe('Best value · Save 50%');
    const gbp = pricesFromStore({
      yearly: { priceLabel: '£24.99', amount: 24.99, currency: 'GBP' },
      monthly: { priceLabel: '£3.99', amount: 3.99, currency: 'GBP' },
    });
    expect(annualCrossedOutLabel(gbp)).toBe('£47.88');
    expect(bestValueTag(gbp)).toBe('Best value · Save 48%');
  });

  it('every amount comes from the pricing module, so store prices (N17) replace them in one place', () => {
    const yearly = { ...PLAN_PRICING.yearly };
    const monthly = { ...PLAN_PRICING.monthly };
    try {
      Object.assign(PLAN_PRICING.yearly, { priceLabel: '$35.99', amount: 35.99 });
      Object.assign(PLAN_PRICING.monthly, { priceLabel: '$5.99', amount: 5.99 });
      expect(planPriceLabel('yearly')).toBe('$35.99/yr');
      expect(planPriceLabel('monthly')).toBe('$5.99/mo');
      expect(annualCrossedOutLabel()).toBe('$71.88'); // monthly × 12 (N17.03)
      expect(annualPerMonthShortLabel()).toBe('$3.00/mo'); // annual ÷ 12 (N17.04)
      expect(bestValueTag()).toBe('Best value · Save 50%'); // 1 - 35.99/71.88 = 49.9% → 50
      Object.assign(PLAN_PRICING.yearly, { priceLabel: '$39.99', amount: 39.99 });
      expect(bestValueTag()).toBe('Best value · Save 44%'); // stays true when 50% doesn't hold
    } finally {
      Object.assign(PLAN_PRICING.yearly, yearly);
      Object.assign(PLAN_PRICING.monthly, monthly);
    }
  });

  it('lines under the names: main paywall (N15.32, N15.39, N15.81)', () => {
    expect(planSubline('yearly', 'trial', true)).toBe('5-day free trial');
    expect(planSubline('monthly', 'trial', true)).toBe('No free trial');
    // Trial already used: "5-day free trial" is hidden on the Annual card.
    expect(planSubline('yearly', 'trial', false)).toBeNull();
    expect(planSubline('monthly', 'trial', false)).toBe('No free trial');
  });

  it('lines under the names: Welcome back (N16.16 to N16.18, N16.24)', () => {
    expect(planSubline('yearly', 'billing', false)).toBe('Billed yearly');
    expect(planSubline('monthly', 'billing', false)).toBe('Billed monthly');
    // Still eligible for the free trial: the trial lines instead.
    expect(planSubline('yearly', 'billing', true)).toBe('5-day free trial');
    expect(planSubline('monthly', 'billing', true)).toBe('No free trial');
  });
});

describe('free trial offered (p.36: one free trial per store account)', () => {
  it('through the stores: only when Apple / Google still offer it AND this account never had one', () => {
    expect(
      trialOffered({ viaStore: true, storeEligible: true, accountEligible: true }),
    ).toBe(true);
    expect(
      trialOffered({ viaStore: true, storeEligible: false, accountEligible: true }),
    ).toBe(false);
    expect(
      trialOffered({ viaStore: true, storeEligible: null, accountEligible: true }),
    ).toBe(false);
    expect(
      trialOffered({ viaStore: true, storeEligible: true, accountEligible: false }),
    ).toBe(false);
  });

  it('while the stores can’t sell: the server’s own rule', () => {
    expect(
      trialOffered({ viaStore: false, storeEligible: null, accountEligible: true }),
    ).toBe(true);
    expect(
      trialOffered({ viaStore: false, storeEligible: true, accountEligible: false }),
    ).toBe(false);
  });
});

describe('timeline and button', () => {
  it('Today (Full access), Day 3 (We remind you), Day 5 (Trial ends) (N15.42 to N15.45)', () => {
    expect(TRIAL_TIMELINE).toEqual([
      { title: 'Today', caption: 'Full access' },
      { title: 'Day 3', caption: 'We remind you' },
      { title: 'Day 5', caption: 'Trial ends' },
    ]);
  });

  it('Annual with the trial: "Start my 5-day free trial" + "No charge today. Cancel anytime." (N15.46, N15.47)', () => {
    expect(startsTrial('yearly', true)).toBe(true);
    expect(paywallButtonLabel('yearly', true)).toBe('Start my 5-day free trial');
    expect(paywallButtonNote('yearly', true)).toBe('No charge today. Cancel anytime.');
  });

  it('Monthly: "Start monthly plan" + "Cancel anytime." (N15.49, N15.50, N16.22)', () => {
    expect(startsTrial('monthly', true)).toBe(false);
    expect(paywallButtonLabel('monthly', true)).toBe('Start monthly plan');
    expect(paywallButtonNote('monthly', true)).toBe('Cancel anytime.');
    expect(paywallButtonLabel('monthly', false)).toBe('Start monthly plan');
  });

  it('trial already used: "Start annual plan" + "Cancel anytime." (N15.79, N15.80, N16.20, N16.21)', () => {
    expect(startsTrial('yearly', false)).toBe(false);
    expect(paywallButtonLabel('yearly', false)).toBe('Start annual plan');
    expect(paywallButtonNote('yearly', false)).toBe('Cancel anytime.');
  });
});

it('no dash punctuation in any paywall text', () => {
  const all = [
    mainPaywallHeader('Konah'),
    welcomeBackHeader('Konah'),
    LABEL_WRITTEN_FOR_YOU,
    LABEL_BASED_ON_ANSWERS,
    PILL_START_TRIAL,
    PILL_SUBSCRIBE,
    WRITING_REFLECTION,
    FAILED_TO_LOAD,
    TRY_AGAIN,
    lastEntryLabel('2026-09-30'),
    ...MAIN_BENEFITS,
    ...welcomeBackBenefits(14),
    ...welcomeBackBenefits(1),
    ...welcomeBackBenefits(0),
    CHOOSE_YOUR_PLAN,
    bestValueTag(),
    ...TRIAL_TIMELINE.flatMap((s) => [s.title, s.caption]),
    ...(['yearly', 'monthly'] as const).flatMap((p) => [
      paywallButtonLabel(p, true),
      paywallButtonLabel(p, false),
      paywallButtonNote(p, true),
      paywallButtonNote(p, false),
      planSubline(p, 'trial', true) ?? '',
      planSubline(p, 'billing', false) ?? '',
    ]),
  ];
  for (const s of all) expect(s).not.toMatch(DASH);
});
