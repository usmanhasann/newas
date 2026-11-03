# Verification of every task against the client PDF (2026-10-21)

**Sources:** `Revisions-10_14_26.pdf` (client, 38 pages, the source of truth), `LYSM-Revisions-10-14-summary.pdf`
(our 48-task summary), the 10 client screenshots and the screen recording in this folder.
**Method:** every task was checked in the code itself (screens, logic, server functions, migrations), read
against the client's own words. Ledger ticks and earlier notes were not taken as proof.
**Code state checked:** the working tree on `main` (last commit `3ea735b` + all uncommitted Phase 1–3 work).

## 1. Does the summary cover the whole client PDF?

Yes. A script compared all 700 sentences of the client PDF against `requirements-ledger.md`. The only
words not found are section headings and labels ("Circle activity banners", "If someone tries, show:").
The requirement behind each of those is present in other words. All 48 summary task titles match the
ledger's task headings exactly.

One client file has no text in the PDF: the **"Two ways to open up"** screenshot (see section 4).

## 2. Baseline

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errors |
| Lint (`eslint .`) | 0 errors, 2 warnings (`require()` in 2 test files) |
| Tests (`jest`, full suite) | 1,388 of 1,389 pass. `AuthStep.test.tsx` failed in the full run but passes alone: a timing-flaky test (it presses "Create Account" again after the screen has moved on). The test needs fixing; the app code is fine. |

## 3. Status of every task

"Code done" means the client's requirement is in the code and was read line by line. It does **not** mean
it is live. Nothing is committed, deployed or built yet (section 5).

### Old work (30 items)

| # | Task | Status | Notes |
|---|---|---|---|
| O1 | Greeting shows "there" | Code done | Never "there". Now "Good afternoon", the client's casing (owner's decision 2026-10-21). |
| O2 | "Early evening" | Code done | |
| O3 | Private reply to a reply | Code done | Needs migration `20261020100000` live, or replies still flatten. |
| O4 | First check-in box behind keyboard | Code done | Phone check needed. |
| O5 | Google/Apple names | Code done | FULL_NAME scope requested; name saved at first authorization; Google name read. Migration `20261016100000` with the build. |
| O6 | Onboarding word forms | Code done | Every answer combination tested. |
| O7 | Insights stuck on old period | Code done | Needs migration `20261020110000` live. |
| O8 | Different method fails silently | Code done | Every refusal now shows a message. |
| O9 | Spinner on wrong button | Code done | Both screens. |
| O10 | Colored circle icons | Code done | Exact hex values as tokens, 46px, 12px gap. |
| O11 | "No circles yet" text | Code done | Word for word. |
| O12 | Leave circle from ••• | Code done | Confirmation text exact; Private adds the invite line. |
| O13 | Circle description updates | Code done | 150 cap + counter; DB cap migration `20261021120500` after the build. |
| O14 | Streak Reminder description | Code done | |
| O15 | "Tap + New Entry" text | Code done | |
| O16 | Tap anywhere on Today's Moods | Code done | |
| O17 | Real 🔥 / ⏳ emoji | Code done | |
| O18 | "Not ready yet" texts | Code done | Breakdown centered, Reflection left-aligned. |
| O19 | No-entries "Moods & Reflections" | Code done | |
| O20 | Mood Breakdown date lines | Code done | |
| O21 | Notifications page: Maybe later, 9 PM, helper line | Code done | |
| O22 | Crisis pop-up half sheet | Code done | |
| O23 | No email in Profile header | Code done | |
| O24 | Send Feedback pills | Code done | |
| O25 | Help & FAQ | Code done | Checked word for word and in order against p.22–23. |
| O26 | Day 3 trial reminder | Code done | Title is the client's sentence. The price is hardcoded until N17. |
| O27 | Check: 9 AM reflection push, skipped if read | Verified | Server function in migration `20261021150500`. |
| O28 | Check: no push for empty period | Verified | Same. |
| O29 | Check: streak popup only first entry | Verified | |
| O30 | Check: leave an archived circle | Verified | |

### New work (18 items)

| # | Task | Status | Notes |
|---|---|---|---|
| N1 | Live circles + "New posts" | Code done | Needs migration `20261022030000` and Supabase Realtime private channels. |
| N2 | Sort Your Circles by activity | Code done | Needs migration `20261022040000`. |
| N3 | Archive/unarchive Public + notifications | Code done | The notifications list now exists; archive notices are saved there even for members who muted the circle (section 7). |
| N4 | Account linking | Code done | Tests cover all 6 scenarios + Hide My Email fallback. Needs Google OAuth clients, secrets, build. |
| N5 | Sign-in & Security | Code done | Needs Resend email, Apple relay domain + SPF (outside the code). |
| N6 | Sign-up / sign-in redesign | Code done | Apple button shows on iPhone only (as before). |
| N7 | Verified badges | Code done | The gap (no check-mark message at account creation) was fixed the same day. See 6. |
| N8 | In-app banners | Code done | Everything the server notifies is saved to the new list, banner or not (section 7). |
| N9 | One combined reflection push | Code done | |
| N10 | Join notifications for owners | Code done | Needs migration `20261022042000` and a new cron job for `circle-join-digest`. |
| N11 | Streak milestones | Code done | Every message checked word for word. |
| N12 | "You're all set" icon + animation | Code done | About 0.64 s, plays once. Phone check against the recording. |
| N13 | Reflection Tone row | Code done | |
| N14 | Phone's timezone | Code done | Travel-day rule in migration `20261022010000`. |
| N15 | Paywall + first reflection + Welcome card | Code done | Store trial eligibility depends on N17. |
| N16 | "Welcome back" paywall | Code done | Keeps a "Log out" link (earlier decision). |
| N17 | Store prices + subscription check | Code done | Built 2026-10-21 (section 7). Live only once the store products, secrets, deploy and a build exist. |
| N18 | Concerning words | Code done | Enforced in the database and re-checked before every AI call. |

**Totals (end of 2026-10-21):** all 48 tasks are in the code (section 7). Earlier the same day it was 47 of
48: N17 wasn't built, and N3 and N8 lacked the notifications list. An even earlier version said "46 of 48",
which was a counting error. Nothing is live until the deploy and build in section 5.

## 4. Gaps and open decisions

### 4.1 Must fix (code): both FIXED the same day, see section 6
1. **N7.22: no check-mark message at account creation.** `signupSchema` (`src/features/auth/schema.ts`), used
   by the onboarding email form and Sign Up, only checks that a name is present. `displayNameSchema`
   (`src/utils/nameSymbols.ts`) has the rule and is unit-tested, but nothing uses it. Today "Taylor ✅" is
   accepted and the ✅ is silently removed on save. The client wants: "Names can’t include check marks or
   verification symbols." shown when creating an account.
2. **Flaky test** `__tests__/components/AuthStep.test.tsx`: make it wait for the call instead of re-pressing.

### 4.2 The in-app notifications list: BUILT the same day, see section 7
The client PDF assumes an in-app notifications list exists (p.8: "should still be saved to the in-app
notifications list"; p.24: "they still see it in the app's notifications list"). **The app has no such
screen.** The Profile → Notifications page holds only settings. Archive changes are already stored in a
table (`circle_archive_events`) ready for a list, but nothing displays them. Options: build the list (new
work, not in the 20h), or ask the client to drop those two lines.

### 4.3 "Two ways to open up" screen: MATCHED to the screenshot the same day, see section 7
The client screenshot differs from the app. In the screenshot the bubbles hold a lock + "Private" and a
globe + "Public". The line reads "**Private Circles** are for your closest people. **Public Circles** are
open to anyone." with the names in bold color, and there are no tags below. The app has empty bubbles,
"...Public Circles are open threads for anyone to join." and two tags. The PDF never mentions this screen.

### 4.4 Earlier decisions to confirm once (already built this way)
- Greeting: DECIDED 2026-10-21, now the client's "Good afternoon".
- 8 PM "longest streak" line only on the first day it would beat the previous longest (same rule as the popup).
- Welcome back paywall keeps "Log out"; one-entry / no-entry wording for "All [number] of your entries".
- Day 3 reminder: the client's title plus a body with renewal date, price and how to cancel.
- Sign In's "Get started" returns to the start of onboarding.

### 4.5 N17 blocks paid launch: BUILT the same day (live after store setup, deploy and build), see section 7
With no in-app purchases, a returning user whose trial is used up sees "In-app purchases aren’t available yet"
on the Welcome back paywall and cannot subscribe. Trial eligibility is per LYSM account, not per Apple ID or
Google account.

## 5. Not live yet (deploy, build and setup)

- **16 migrations** not in production, from `20261016100000_display_name_from_provider.sql` through
  `20261022120000_crisis_words_entries.sql`. Some must go out only after the new build is installed (see
  each file's header and the earlier deploy-order notes).
- **17 edge functions** new or changed: account-link, ai-summary, change-email, circle-join-digest,
  confirm-email-verification, delete-account, detect-crisis, detect-private-threat, generate-reflections,
  moderate-circle-content, password-reset, recap-notifications, request-email-verification, send-push,
  streak-reminder, update-password, welcome-reflection.
- **Secrets / setup:** `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_ID`, Apple revoke key, Resend (`RESEND_*`),
  native Google OAuth clients (iOS + Android), Supabase Realtime private channels, pg_cron job for
  `circle-join-digest`, Apple private relay domain + SPF, `support@lysm.app` mailbox, rotate `CRON_SECRET`.
- **App build** (iOS + Android), only on the owner's go-ahead.
- **Phone checks:** keyboard on first check-in (O4), "You're all set" animation vs recording (N12),
  banners slide/swipe/4 s (N8), half-sheet (O22), sign-in screens vs mocks (N6), paywalls vs mocks (N15, N16).

## 6. Fixes made after this check (2026-10-21, owner's go-ahead)

1. **N7.22 fixed: check-mark message at account creation.** `signupSchema.displayName` now uses
   `displayNameSchema` (`src/features/auth/schema.ts`), the same rule as Edit Profile. Both account-creation
   forms (onboarding "Continue with Email" and the Sign Up screen) now show "Names can’t include check marks
   or verification symbols." under the name, and no account is created until it's taken out. An empty name
   still shows "Your name helps personalize LYSM". Names from Google / Apple are still cleaned
   automatically, since the person didn't type them. Client-only change: no migration, no server change.
   New tests: `authSchema.test.ts` (all 5 client symbols), `AuthStepNameCheckMark.test.tsx`,
   `SignUpNameCheckMark.test.tsx`. All three fail on the old code and pass with the fix.
2. **Flaky test fixed:** `AuthStep.test.tsx` now presses "Create Account" once and waits for the result
   (it used to press again on every retry, and the button was gone once the screen moved on). Each text
   change is awaited inside `act`.

**After the fixes:** typecheck 0 errors; lint 0 errors (the same 2 warnings in older test files); full test
suite **1,393 of 1,393 pass** (359 files), including the 4 new tests.

Still open from section 4: the in-app notifications list (4.2), the "Two ways to open up" screen (4.3), N17.

## 7. "Production ready" work (2026-10-21, owner's request and decisions)

Owner's decisions: native in-app purchases with our own server check; a bell on the Journal tab for the
notifications list; the greeting exactly as the client wrote it; go-ahead to push to GitHub only (no
deploy, no build).

1. **In-app notifications list (N3.27, N8.18).** A bell at the top right of the Journal tab, with a
   purple dot while anything is unread, opens the list: newest first, 30 at a time, unread rows
   tinted, a verified person's badge after their name, a live one-line preview of a new post or reply,
   and a tap opens what it's about (same places as the banner). Opening the list marks everything
   read. The server saves every notification it sends for each person it's for, phone or no phone,
   and archive notices also for members who turned that circle's notifications off (p.24). Kept 90
   days. Not in the list: the daily check-in and trial reminders, which are scheduled on the phone, so
   the server never knows about them. Reflection notifications are saved only for people with
   notifications turned on, as before.
   Files: migration `20261022130000_notifications_list`, `_shared/notificationsList.ts` (send-push,
   join digest, recap and streak reminder save to it), `NotificationsListScreen`, `NotificationBell`.
2. **"Two ways to open up" matches the client screenshot:** a lock with "Private" and a globe with
   "Public" inside the bubbles, the headline on one line, "**Private Circles** are for your closest
   people." / "**Public Circles** are open to anyone." in the circle colors, and no tags.
3. **Greeting** "Good morning / afternoon / evening, [name]" in the client's casing.
4. **N17, real store purchases** (expo-iap 5.8.3 + Edge Function `validate-purchase`):
   - Prices come from the App Store / Google Play in the person's currency. The crossed-out price is
     monthly × 12 and the per-month price is annual ÷ 12, written like the store writes its prices.
     This covers both paywalls, the "You're all set" screen and the Day 3 reminder.
   - The 5-day free trial is the stores' own free-trial offer on Annual. Apple / Google decide who can
     still have it, and a LYSM account that already had a trial gets no second one (p.36).
   - Every purchase is checked with Apple / Google on the server before it counts, and only then
     finished. It's tied to the account, and one store subscription unlocks one account.
   - The subscription is re-checked with the store every time the app opens (p.38). A cancelled plan
     keeps access until its paid period ends. Restore purchases and Profile → Subscription open the
     store's own settings.
   - Until both products exist in the stores, the app keeps its own 5-day trial, so nobody is stuck.
     The paid plans then say purchases aren't available right now.
   - Product ids: `lysm.premium.annual` (5-day free trial) and `lysm.premium.monthly`. Store setup
     and secrets are in DEPLOY.md.
5. **Removed dead code:** the old toggle-paywall helpers in `pricing.ts` (paywallTitle,
   paywallCtaLabel, renewalClause, trialClarity, and others) were used nowhere.

**Not verifiable from here, still needed:**
- The store products created by the account owner, the secrets, the deploy (migrations in the order
  in DEPLOY.md) and an iOS + Android build. Each of these waits for the owner's go-ahead.
- Sandbox purchase tests on real phones.
- The new SQL (notifications list, store purchases) has not run against a database yet: the only
  database is production, and touching it wasn't approved. The rolled-back checks in
  `supabase/tests/` run on deploy day.
