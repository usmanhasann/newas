// Paid purchase + manage/restore now live in @features/iap (App Store / Google Play).
export { PaywallScreen } from './screens/PaywallScreen';
export { RestoreLink } from './components/RestoreLink';
// The main paywall's parts (client revisions 10/14 p.32 to p.36), used by the onboarding TrialStep.
export { FirstReflectionCard } from './components/FirstReflectionCard';
export {
  PaywallHeader,
  BenefitList,
  PlanCards,
  TrialTimeline,
  PaywallFooter,
} from './components/PaywallParts';
export {
  MAIN_BENEFITS,
  mainPaywallHeader,
  paywallButtonLabel,
  paywallButtonNote,
  startsTrial,
} from './paywallCopy';
export {
  useSubscription,
  useSubscriptionView,
  useEntitlement,
  useStartTrial,
  usePlanPrices,
  usePaywallMode,
  useStoreSubscriptionSync,
  subscriptionKeys,
} from './hooks';
export { isEntitled, toSubscriptionView, startTrial, fetchMySubscription } from './api';
export type { SubscriptionView } from './api';
export {
  PLAN_PRICING,
  DEFAULT_PLAN,
  TRIAL_DAYS,
  priceWithPeriod,
  annualPerMonthLabel,
  pricesFromStore,
  formatLikePrice,
} from './pricing';
export type { PlanId, PlanPricing, PlanPrices } from './pricing';
