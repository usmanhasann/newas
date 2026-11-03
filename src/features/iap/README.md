# In-app purchases (App Store / Google Play)

Client revisions 10/14 p.32-38 (N17); owner's decision 2026-10-21: native in-app purchases with
our own server check.

## How it works

- `products.ts`: the exact product ids (create them in the stores with these ids, see DEPLOY.md).
- `storeCatalog.ts` (pure): the stores' prices in the person's currency, and whether the Annual
  plan's 5-day free trial is still on offer (Google lists only offers the account can take; iOS asks
  StoreKit `isEligibleForIntroOfferIOS` for the subscription group).
- `nativeService.ts`: expo-iap (StoreKit 2 / Play Billing). A purchase is tied to the LYSM account
  (`appAccountToken` / `obfuscatedAccountId` = the account id), sent to the `validate-purchase`
  Edge Function, and finished only after the server confirmed it with Apple / Google. Unchecked
  purchases come back (iOS at launch, Android until acknowledged) and are checked again
  (`useStorePurchaseListener`, app root).
- `validate-purchase` (Edge Function, `supabase/functions/_shared/storePurchase.ts`): App Store
  Server API / Play Developer API, then `apply_store_subscription` (migration
  `20261022140000_store_purchases`). One store subscription unlocks one LYSM account.
- `@features/subscription`: `usePaywallMode` sells through the stores when they can sell both
  plans, else falls back to the app's own trial (`start_trial`) so nobody is stuck before the store
  products exist. `useStoreSubscriptionSync` re-checks the store subscription every time the app
  opens (p.38). Prices on both paywalls, the "You're all set" screen and the Day 3 reminder come
  from the stores (`usePlanPrices`).

## Needs (outside the code)

1. The two subscriptions in App Store Connect and Google Play Console (DEPLOY.md, "In-app purchases").
2. Edge Function secrets: `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`,
   `GOOGLE_PLAY_SERVICE_ACCOUNT`.
3. A new app build (expo-iap is a native module: `expo-iap` config plugin in app.config.ts).
4. Sandbox testing: App Store sandbox testers / TestFlight, and Play Console license testers.
