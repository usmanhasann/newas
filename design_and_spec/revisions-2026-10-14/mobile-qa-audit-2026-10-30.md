# LYSM — Complete Revision Audit

**Source:** `Revisions 10_14_26.pdf` (38 pages). Repo copy: `design_and_spec/revisions-2026-10-14/Revisions-10_14_26.pdf`.
**Code checked:** `main` at `21c96a8` (the 10/14 work landed in `f161089`; backend deployed with iOS build 12 in `4a3ae55`).
**Checked on:** 2026-10-30. No source code was changed for this audit.

## How to read this report

- Every revision has a fixed ID **R1–R34** in PDF order, so you can find it in the PDF. The report lists them in user-journey order (onboarding first, then in-app).
- **Original Revision Text** is quoted from the PDF without changes. Line breaks inside a sentence (page wraps) are joined. Two emoji on p.5 (✅ and ☑️) were dropped by the PDF text layer and are restored from the page image.
- Three long revisions span both phases. They are split **explicitly** at the PDF's own section boundaries, and each part says so: **R23** (Email and password) → 23A onboarding, 23B in-app. **R34** (Paywall) → 34A onboarding, 34B in-app journal, 34C Welcome back paywall. Together the parts hold the full original text, with nothing left out or repeated.
- **Code status** is what the repository contains. **Mobile Testing Status** starts as **NOT TESTED** for every item and changes only when you report a result.
- PDF p.30 has a handwritten-style **"done"** note beside the crisis half-sheet item (R32). It is not part of the requirement text.

## ⚠️ Read first: what build 12 can and can't show yet

The code for all 34 revisions is in the repo, but the backend for build 12 is only **partly** live (`DEPLOY.md`, header). Items that depend on the missing parts will **fail or be blocked on the phone even though the code is done**:

| Not live yet | Revisions affected | What you'll see on build 12 |
|---|---|---|
| **Step 3 migrations** (meant to run after testers install build 12): `20261020100000_private_reply_depth`, `20261020110000_insights_empty_periods`, `20261021120500_circle_description_limit` | R10, R19, R29 (server cap only) | R10: replying to a reply in a Private circle still attaches to the post. R19: Insights still sticks on the last period that had entries. R29: the app stops typing at 150 characters, but the database doesn't enforce it yet. |
| **`circle-join-digest` cron job** | R13 items 18–21 | Only the first join in a quiet spell is announced. Joins in the next 10 minutes wait and are never combined. |
| **Supabase Realtime Authorization / private channels** (dashboard setting) | R13 items 1–5, R4 item 6 | Live circle updates use private Realtime topics (`src/features/circles/liveApi.ts:53`). Live updates may not arrive until that setting is on. CANNOT VERIFY from the repo. |
| **New secrets** (`GOOGLE_OAUTH_CLIENT_IDS`, Apple keys, IAP keys) | R21 (Google re-authentication), R34 (store purchases) | Linking that has to confirm with Google may fail. |
| **Store products** (`lysm.premium.annual`, `lysm.premium.monthly`) not created | R34A sections 2–3 and 8, R34C | Prices shown are the built-in defaults ($29.99 / $4.99), not store prices. The trial is the app's own 5-day trial. "Start monthly plan" / "Start annual plan" show "Purchases aren't available right now." |
| **Apple private relay sending domain + SPF** (outside the code) | R23B section 5 | Emails to `@privaterelay.appleid.com` addresses may bounce. |

**Test accounts you'll need:** (a) a fresh install for onboarding; (b) an iPhone for Apple sign-in (the Apple button shows on iOS only); (c) a brand-new account with **no entries**; (d) an account with entries but **less than a week old**; (e) an account with **a past week that has zero entries**; (f) two accounts in the same Private circle and the same Public circle (one owner, one member); (g) an account set `verified = true` in Supabase (Table Editor → `profiles` → `verified`).

---

## PHASE 1 — ONBOARDING FLOW

The real onboarding order (`src/features/onboarding/flow.ts`, `BASE_ORDER`): Welcome → What brought you here → Birthday → Value graph → **How often do you feel overwhelmed?** → Who do you turn to → Goal → Thanks for sharing → Reflection tone → **The shift you're working toward** → Two ways to open up → **Let's try your first check in** → **You're all set (100% checklist)** → **Save your progress (sign-up)** → **Paywall** → **Trial confirmation** → **Notifications** (last; finishes onboarding). From Welcome, **Sign In** opens the "Welcome back" sign-in screen.

---

### R32 — Make the crisis resources pop-up in onboarding a half-screen sheet

**Original PDF Page:** 30–31 (the PDF has a "done" note beside it)

**Original Revision Text:**

> ● Make the crisis resources pop-up in onboarding a half-screen sheet
>
> 1. When the user taps to open the crisis resources pop-up ("You're not alone in this") during onboarding, it should slide up from the bottom and cover only the bottom half of the screen. The top half of the onboarding screen should stay visible behind it, slightly dimmed.
> 2. The content inside the pop-up stays the same (988 Suicide & Crisis Lifeline, Crisis Text Line, and Outside the US). The pop-up should scroll so users can reach everything below what fits in the bottom half.
> 3. Add an X button in the top right corner of the pop-up. Tapping it closes the pop-up.
> 4. Tapping the dimmed top half of the screen should also close the pop-up.

**Testing Phase:** ONBOARDING FLOW · **Category:** Onboarding Questions

1. **Mobile screen:** Onboarding step 5, "How often do you feel overwhelmed?"
2. **Navigation:** Fresh install → Get Started → answer "What brought you here today" → birthday (18+) → Continue on the value graph → "How often do you feel overwhelmed?" → tap **See crisis resources** in the gray line under the answers.
3. **What to verify:** The sheet slides up and covers the bottom half only. The question screen stays visible and dimmed above it. You can scroll to 988, Crisis Text Line and Outside the US. An X sits top right. Tapping the X or the dimmed top half closes it.
4. **Code:** `CrisisDisclaimer` → `CrisisResourcesSheet`. Files: `src/features/crisis/components/CrisisDisclaimer.tsx`, `src/features/crisis/components/CrisisResourcesSheet.tsx` (sheet `height: '50%'`, backdrop `testID="crisis-resources-backdrop"`), `src/features/crisis/components/CrisisLines.tsx`, `src/features/onboarding/screens/OnboardingScreen.tsx:81`.
5. **BEFORE (repo now):** Half-height sheet that slides up from `height/2`, with a dimmed pressable backdrop that closes it, an X button, and scrollable content.
6. **AFTER (required):** As above.
7. **Logic & edge cases:** The same sheet is used after an entry with concerning words (R34B section 7). While it is open, in-app banners are held (R13 item 8, `CrisisResourcesSheetHoldsBanners.test.tsx`). Android back closes it (`onRequestClose`).
8. **Code status:** **IMPLEMENTED.** All 4 points are present in `CrisisResourcesSheet.tsx`.
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] covers bottom half only [ ] top half visible and dimmed [ ] content scrolls to "Outside the US" [ ] X closes [ ] tap on dimmed area closes [ ] content unchanged
11. **Files requiring changes:** None.

---

### R17 — Grammar bug on two onboarding summary screens

**Original PDF Page:** 11–12

**Original Revision Text:**

> ● Grammar bug on two onboarding summary screens — both share the same root cause, not two separate typos.
>
> What's happening: these screens insert the short label text from an earlier multiple-choice answer directly into a new sentence, without adjusting its word form to fit. A label written as a noun for a button ("Managing stress," "Most days") doesn't automatically become the right word form when dropped into a different sentence structure later.
>
> Example 1 — "The shift you're working toward" screen: currently shows "Right now: Stress most days." Should be "Right now: Stressed most days" — "Stress" is a noun, but the sentence needs an adjective describing the person's current state.
>
> Example 2 — the 100% onboarding summary checklist: currently shows "Steadying the overwhelm that shows up most days." This doesn't read naturally — "overwhelm" as a bare noun here is awkward, especially since the actual onboarding question asked "how often do you feel overwhelmed" (the adjective form). Confirmed final wording: "Steadying the days that overwhelm you most" — uses "overwhelm" as a verb instead of a noun, which fixes the awkwardness while still carrying the frequency idea.
>
> What to actually check: the two examples above are only from the specific answers I selected during my own onboarding — each onboarding question has multiple possible answers, and different combinations of selections generate different versions of these sentences, most of which I haven't personally seen. Since this is a word-form mismatch between quiz-answer labels and the sentence templates they get inserted into, the same bug could easily be sitting in other answer combinations I never tested. The fix isn't just correcting these two specific lines — it's checking every sentence template against every possible answer that could get inserted into it, so it reads correctly no matter which options a given user actually selected.

**Testing Phase:** ONBOARDING FLOW · **Category:** Personalization & AI Insights

1. **Mobile screens:** Step 10 "The shift you're working toward" and step 13, the "You're all set" plan checklist (progress reaches 100%). The sentence templates also appear on step 8 "Thanks for sharing".
2. **Navigation:** Onboarding → … → "How often do you feel overwhelmed?" (pick an answer) → … → Reflection tone → **The shift you're working toward** → Two ways to open up → First check in (Save or Skip) → **plan checklist**.
3. **What to verify:** The "Right now" card reads as a state, e.g. **"Stressed most days"**. The checklist row reads, e.g., **"Steadying the days that overwhelm you most"**. Repeat with each frequency answer and several motivations, goals, supports and tones. No sentence should read awkwardly.
4. **Code:** `ShiftStep`, `BuildingStep`, `ReflectStep`; templates in `src/features/onboarding/copy.ts` (`stressStateLabel`, `goalOutcomeLabel`, `overwhelmPlanLabel`, `supportPlanLabel`, `motivationFocus`, `goalAspiration`, `reflectionStylePhrase`, `reflectBack`).
5. **BEFORE (repo now):** Each answer maps to a full, hand-written phrase for each sentence, never the raw button label:
   - Right now: Rarely → "Occasionally stressed", Sometimes → "Stressed now and then", Most days → "Stressed most days", Almost always → "Stressed almost all the time".
   - Checklist: "Steadying the rare days that overwhelm you" / "…the days that overwhelm you now and then" / "…the days that overwhelm you most" / "…the days that so often overwhelm you".
   - With LYSM: "Feeling calmer", "Noticing your patterns", "Building a steady daily habit", "Feeling less alone", "Having more good days than hard ones".
   - Tone row: "Tuning your reflections to sound gentle and direct" (lower case, "and", never "&").
6. **AFTER (required):** Every template reads correctly for every answer. The two client examples use the client's exact words.
7. **Logic & edge cases:** Multi-select answers use the **first** choice in these sentences. Missing answers fall back to neutral phrases ("Feeling stressed", "Steadying the days that feel heavy"). Tests: `__tests__/components/ShiftStep.test.tsx` and the copy tests ("every answer combination tested", per `verification-2026-10-21.md`).
8. **Code status:** **IMPLEMENTED.** Both examples match exactly, and every frequency, goal, support, motivation and tone value has its own phrase.
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] Most days → "Stressed most days" [ ] Most days → "Steadying the days that overwhelm you most" [ ] Rarely / Sometimes / Almost always read naturally on both screens [ ] "Thanks for sharing" reads naturally [ ] tone row with 2 tones reads "… gentle and direct"
11. **Files requiring changes:** None.

---

### R12 — Fix the text box disappearing behind the keyboard on "Let's try your first check in"

**Original PDF Page:** 6–7

**Original Revision Text:**

> ● Fix the text box disappearing behind the keyboard on "Let's try your first check in"
>
> On the onboarding screen "Let's try your first check in.", when the user taps the "What's on your mind?" text box and the keyboard opens, the text box is currently squished or hidden. Only the label and the "Save & reflect" button are visible. The text box should be visible on screen by default, without needing to scroll down. When the keyboard opens, the screen should automatically scroll so the text box is fully visible and centered in the space above the keyboard. The user should be able to see what they're typing the whole time. The text box should keep its normal size when the keyboard is open, never shrink or collapse. As the user types more lines, the screen should keep scrolling so the line they're typing stays visible above the keyboard. While typing, the user should still be able to scroll up and down the screen without the keyboard closing or the text box losing focus. If the user taps anything outside the text box, like a mood, the keyboard closes and they leave the text box. Everything they typed stays, and they can tap back into the text box to keep typing where they left off.

**Testing Phase:** ONBOARDING FLOW · **Category:** First Check-in

1. **Mobile screen:** Step 12, "Let's try your first check in."
2. **Navigation:** Onboarding → … → Two ways to open up → Continue.
3. **What to verify:** The "What's on your mind?" box is visible without scrolling. Tap it: the screen scrolls so the box sits centered above the keyboard, at its normal size. Type 6+ lines: the line you're typing stays visible. Drag the screen up and down while typing: the keyboard stays open. Tap a mood: the keyboard closes, the text stays, and tapping the box again resumes typing.
4. **Code:** `FirstCheckinStep` + `useKeyboardComposer` + `StepScaffold` composer mode. Files: `src/features/onboarding/screens/steps/FirstCheckinStep.tsx`, `src/features/onboarding/useKeyboardComposer.ts`, `src/features/onboarding/keyboardScroll.ts` (`NOTE_MIN_HEIGHT`, `noteMaxHeight`), `src/features/onboarding/measure.ts`, `src/features/onboarding/components/StepScaffold.tsx`, `src/features/moods` `MoodPicker` (`onInteract={Keyboard.dismiss}`).
5. **BEFORE (repo now):** The box is measured and centered above the keyboard when it opens. Its `minHeight` is fixed, so it never shrinks; it grows to a max height, then scrolls inside. The space the keyboard covers is added below the content, so the screen keeps its size. Dragging doesn't dismiss the keyboard. A mood tap dismisses it.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** iOS and Android are handled separately (`FirstCheckinKeyboardAndroid.test.tsx`). Reopening the keyboard re-centers it (`FirstCheckinKeyboardReopen.test.tsx`). Very large system fonts can make the layout taller.
8. **Code status:** **IMPLEMENTED** in code. Placement on screen can only be confirmed on a phone (listed as a phone check in `verification-2026-10-21.md`).
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist (test on iPhone and Android if possible):** [ ] box visible without scrolling [ ] keyboard open → box fully visible and centered [ ] box never shrinks [ ] 6+ lines → typed line stays visible [ ] can scroll while typing without losing focus [ ] tap a mood → keyboard closes, text kept [ ] tap box again → cursor back, keep typing
11. **Files requiring changes:** None.

---

### R33 — Redesign the sign-up and sign-in screens

**Original PDF Page:** 31–32

**Original Revision Text:**

> ● Redesign the sign-up and sign-in screens
>
> I've attached images of both redesigned screens so you can see exactly what they should look like. Both screens should use the same layout so they feel like one app.
>
> **1. Shared layout (both screens)**
>
> In the center of the screen: the LYSM app icon (use the real app icon file), with the headline under it in the serif heading font and the subtext under that in smaller gray text.
>
> At the bottom of the screen: the three sign-in buttons, stacked in this order:
> 1. Continue with Apple (black button, white text, white Apple logo)
> 2. Continue with Google (white button, light gray border, dark text, colored Google logo)
> 3. Continue with Email (white button, light gray border, dark text, purple envelope icon)
>
> All three buttons should be the same size and shape, with the same text size and font. Each icon sits right next to its text, and both are centered in the button.
>
> **2. Sign-up screen (onboarding)**
>
> Keep the progress bar at the top.
>
> Headline: "Save your progress"
>
> Subtext: "Create your account so your plan and entries are always here for you."
>
> Under the buttons, in small gray text: "By continuing, you agree to our Terms and Privacy Policy." "Terms" and "Privacy Policy" should be purple links that open those pages.
>
> **3. Sign-in screen (Welcome back)**
>
> Keep the back arrow in the top left corner, working the same way it does now.
>
> No progress bar.
>
> Headline: "Welcome back"
>
> Subtext: "Sign in to pick up right where you left off."
>
> Under the buttons: "Don't have an account? Get started," where "Get started" is a purple link that takes the user to onboarding.
>
> **4. Fix the loading spinner showing on the wrong button**
> I've attached a screenshot of this bug. When a user taps "Continue with Apple," the Google button shows a loading spinner, even though nothing is happening with Google. The loading spinner should only appear on the button the user tapped. While it's loading, the other buttons can be grayed out so they can't be tapped, but they should keep their normal text and icons. This applies to both screens.

**Testing Phase:** ONBOARDING FLOW · **Category:** Save Progress / Account Creation (+ Welcome / Sign In)

1. **Mobile screens:** (a) Step 14 "Save your progress". (b) "Welcome back" Sign In.
2. **Navigation:** (a) Onboarding → … → plan checklist → Continue. (b) Fresh install → Welcome → **Sign In**.
3. **What to verify:** Compare against `p31-sign-up-save-your-progress.png` and `p31-sign-in-welcome-back.png`. App icon, serif headline and gray subtext are centered. Buttons at the bottom: Apple (black), Google (white, gray border, color "G"), Email (white, purple envelope), all the same size. Sign-up: progress bar, no back arrow, and the legal line with purple Terms / Privacy Policy links that open the pages. Sign-in: back arrow, no progress bar, and "Don't have an account? Get started" (purple) returning to onboarding. Tap Apple: only Apple spins, and the others gray out but keep their icon and text. Repeat with Google.
4. **Code:** `AuthHero`, `AppIconTile`, `AuthProviderButtons`, `LegalNotice` in `src/components/SocialAuth.tsx`. `AuthStep` (`src/features/onboarding/screens/steps/AuthStep.tsx`). `SignInScreen` (`src/features/auth/screens/SignInScreen.tsx:98-122`). Icon: `assets/icon.png`.
5. **BEFORE (repo now):** Both screens share `AuthHero` + `AuthProviderButtons`. The `busy` state is per button, so only the tapped one spins and the others are disabled at `opacity-50` with normal icons. Exact headlines, subtexts and links are present.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The **Apple button shows only where Apple sign-in is available (iOS)**, so on Android you'll see only Google and Email. "Continue with Email" opens an inline form (Name, Email, Create Password, optional invite code) on sign-up, or `EmailSignInScreen` on sign-in. The sign-up step has no back arrow by design (`flow.ts canGoBack('auth') = false`). Tests: `AuthStepSpinnerApple/Google`, `SignInSpinnerApple/Google`, `AuthStepLegalLinks`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] sign-up matches mockup [ ] sign-in matches mockup [ ] order Apple / Google / Email [ ] same size and font [ ] icon next to text, centered [ ] Terms and Privacy open [ ] "Get started" goes to onboarding [ ] back arrow on sign-in only [ ] spinner only on tapped button (both screens, Apple and Google)
11. **Files requiring changes:** None.

---

### R15 — Bug: Google / Apple sign-ups don't get a name ("Good Evening, there")

**Original PDF Page:** 10

**Original Revision Text:**

> ● Bug: users who sign up via "Continue with Google" or "Continue with Apple" aren't getting a name pulled from that account — the home screen greeting shows the literal placeholder "Good Evening, there" instead of an actual name.
>
> Fix: pull the user's name from the Google or Apple account they signed up with, and use it automatically. Users can still change their name afterward in Profile settings if they want — this doesn't lock anything in, it just gives every account a real name from the start instead of a broken placeholder.
>
> One critical, Apple-specific detail that has to be handled correctly, since it can't be fixed after the fact: Apple only includes the user's name in the sign-in response on the very first authorization a user ever grants your app — every sign-in after that, Apple returns nothing for the name field at all, permanently, even if the app asks again. This means the name has to be captured and saved to the user's profile at the exact moment of that first authorization, not fetched on-demand later. Two things worth Muhammad checking specifically:
>
> 1. Whether the app's Sign in with Apple request is even asking for the name (the fullName scope) — if that scope was never requested, Apple won't return a name at all, first authorization or not.
> 2. Whether this was being captured and saved at that first-authorization moment, or just not read from the response at all.
>
> Important consequence for users who already signed up via Apple and got the broken "there" placeholder: since Apple won't return the name again on future sign-ins, this fix only prevents the bug for new sign-ups going forward. Anyone already affected can't have their name automatically recovered — they'll need to set it manually in Profile settings. Google sign-in doesn't have this same one-time limitation, so any Google-based accounts affected should be able to get their name pulled retroactively without issue.

**Testing Phase:** ONBOARDING FLOW · **Category:** Sign Up / Authentication (result shows on Home)

1. **Mobile screens:** "Save your progress" → Continue with Google / Apple. Result: Journal tab greeting and Profile name.
2. **Navigation:** Fresh install → onboarding → Save your progress → Continue with Google (or Apple, on iPhone) → paywall → … → Journal tab.
3. **What to verify:** The greeting reads "Good morning / afternoon / evening, [first name]" with the Google or Apple account's name, never "there". For Apple, this needs an Apple ID that has **never** authorized LYSM. Otherwise first revoke it in iPhone Settings → [your name] → Sign in with Apple → LYSM → Stop Using.
4. **Code:** `signInWithApple` requests `AppleAuthenticationScope.FULL_NAME` (`src/features/auth/social.ts:132-143`), keeps the name on the phone right away (`src/store/appleName.ts`) and saves it to the account (`saveAppleName`). `useSyncDisplayName` / `syncDisplayNameFromAuth` (`src/features/profile/api.ts:100-150`) fills an empty profile name. Migration `supabase/migrations/20261016100000_display_name_from_provider.sql` names new profiles from `display_name` → `full_name` → `name` and backfills Google accounts once.
5. **BEFORE (repo now):** FULL_NAME is requested. The name is captured from the very first Apple response and kept on the phone until it's saved. Google's name is read from the account. The app only ever fills an **empty** name, so it never overwrites a name the user chose. The greeting never uses "there" (`src/features/journal/logic.ts:130-142`).
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Apple accounts already affected can't be recovered (as the PDF says). If Apple shares no name, for example because the person removed it on the Apple sheet, the fallback is the email's first part. With Hide My Email that is a random relay string, which the user can change in Edit Profile. The migration is deployed (step 2, with build 12).
8. **Code status:** **IMPLEMENTED.** Both of the PDF's check questions are answered yes in the code.
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] new Google sign-up → real first name on Home [ ] new Apple sign-up (fresh Apple ID authorization) → real first name [ ] Profile shows full name [ ] name editable in Edit Profile [ ] greeting never says "there"
11. **Files requiring changes:** None.

---

### R21 — Account linking (email matches an existing account)

**Original PDF Page:** 15–16

**Original Revision Text:**

> ● Account linking — when a sign-in method doesn't match how the account was originally created, but the email matches an existing account.
>
> **Current bug:** right now this just silently blocks the user with no explanation at all.
>
> **General principle:** whenever a sign-in attempt's email matches an existing account, trigger a linking flow instead of blocking — but never merge automatically. Always verify it's genuinely the same person first. Which verification method to use depends on how the existing account was originally created:
>
> If the existing account has a password (created via email + password) → verify by entering that password.
>
> If the existing account has no password (created via Google or Apple only) → verify by re-authenticating through whichever provider the account was originally created with.
>
> **All six scenarios, and what verification each one needs:**
>
> **Email + password account → signs in with Google → enter original password**
>
> **Email + password account → signs in with Apple → enter original password**
>
> **Google account → signs in with Apple → re-authenticate through Google**
>
> **Google account → signs in with email + password → re-authenticate through Google, then set a new password**
>
> **Apple account → signs in with Google → re-authenticate through Apple**
>
> **Apple account → signs in with email + password → re-authenticate through Apple, then set a new password**
>
> The two "set a new password" rows are different from the others — the user isn't confirming an existing credential, they're creating a brand new one that's never existed for this account. That should only happen after the re-authentication step succeeds, not before.
>
> **Apple "Hide My Email" — a cross-cutting issue affecting every scenario involving Apple, not just one.** When someone signs in with Apple, they can choose to share a private relay address (e.g., xyz123@privaterelay.appleid.com) instead of their real email. Google always returns the person's actual email, with no equivalent privacy option. This means: if Apple is involved anywhere in a user's sign-in history — as the original method or a later attempt — and they used Hide My Email, the email on file won't match what the other provider hands back, even though it's genuinely the same person. The automatic email-matching trigger won't fire, and without a fallback, this could silently create a second, disconnected account for someone who already has one. This needs an explicit fallback (e.g., prompting the user to confirm manually if a match seems likely, or some other method) — not just assumed away, since it's a real path users can hit any time Apple sign-in is one of the methods involved.
>
> **Important: nothing gets discarded when a new method is linked.** All linked methods stay fully functional side by side afterward. The user would still be able to sign in with their original email and password, or with Google, or with Apple — any of the three leads to the same single account. Linking adds a way in, it never removes one that already existed.

**Testing Phase:** ONBOARDING FLOW · **Category:** Sign Up / Authentication (also Welcome → Sign In)

1. **Mobile screens:** "Link your account" (`LinkAccount`), opened from "Save your progress" or from Sign In. The "Already have a LYSM account?" prompt.
2. **Navigation:** Create account A one way (e.g. email + password with your Gmail address) and log out (Profile → Log Out). Then fresh onboarding → Save your progress (or Welcome → Sign In) → try a **different** method with the same email (e.g. Continue with Google).
3. **What to verify:** For each of the 6 rows: no silent failure. "Link your account" asks for the original password, or offers only the original provider. The two "set a new password" rows show password fields **only after** the provider step succeeds. Afterwards, every method signs in to the same account (same entries). Apple with Hide My Email: "Already have a LYSM account?" appears before a second account is created.
4. **Code:** `LinkAccountScreen` (`src/features/auth/screens/LinkAccountScreen.tsx`), `src/features/auth/linkFlow.ts` (`resolveAccountLink`, `startEmailAccountLink`, `confirmForNewPassword`, `finishNewPassword`), `linkApi.ts`, `linkMessages.ts` (`HAVE_ACCOUNT_TITLE`), `AuthStep.tsx` (`socialFailed`, `emailTaken`), `SignInScreen.tsx:58`. Server: Edge Function `supabase/functions/account-link/`, migration `20261022110000_account_link_precheck.sql`.
5. **BEFORE (repo now):** All six paths are handled. Every refusal shows a message. "No, create one" on the Hide My Email prompt creates a new account.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** "Email account → signs up with email again" in onboarding opens the email sign-in page with the email filled in. Linking is only offered for **verified** emails (R23A). Re-authenticating with Google needs the `GOOGLE_OAUTH_CLIENT_IDS` secret, which is **not set yet** per `DEPLOY.md`, so Google-confirmation rows may fail on build 12. Tests: `accountLink.test.ts`, `LinkAccount*.test.tsx`, `AuthStepLinkRequired`, `SignInLinkRequired`.
8. **Code status:** **IMPLEMENTED** (all 6 scenarios plus the Hide My Email fallback in code). Live behavior depends on secrets.
9. **Mobile Testing Status:** NOT TESTED (Google re-authentication rows may be **BLOCKED** until the secret is set)
10. **Checklist:** [ ] Email acct → Google → password asked [ ] Email acct → Apple → password asked [ ] Google acct → Apple → Google re-auth [ ] Google acct → email → Google re-auth, then set password [ ] Apple acct → Google → Apple re-auth [ ] Apple acct → email → Apple re-auth, then set password [ ] password fields only after re-auth [ ] Hide My Email → "Already have a LYSM account?" [ ] all methods still sign in afterwards [ ] no silent block anywhere
11. **Files requiring changes:** None in code. Setup: `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_ID` secrets.

---

### R23A — Email and password: full spec (Part A of 2: intro + section 1, email verification at sign-up)

> R23 is split at the PDF's own section headings. Part A (onboarding) holds the opening paragraph and section 1. Part B (in-app, Phase 2) holds "Where the in-app changes live" and sections 2–5.

**Original PDF Page:** 17–19

**Original Revision Text:**

> ● Email and password: full spec
>
> Covers email verification at sign-up, changing email and password inside the app, forgot password, and Apple's "Hide My Email" addresses. Linking Google, Apple, and email sign-in to one account is covered in the Account linking section. This one covers everything around it.
>
> **1. Verify email right after Create Account (email + password sign-ups only)**
>
> **Who it applies to:** only email + password sign-ups. Google and Apple already verify the email themselves, so those users skip this step.
>
> **Where it goes:** immediately after the user taps Create Account, before the paywall. They can't continue to the paywall until the email is verified. This keeps the screens after the paywall at the two that exist now (trial confirmation and notifications).
>
> **How it works:** a short code (for example, 6 digits) is emailed, and the user types it into the app. A code, not a link, because a link sends people off to their mail app and some never come back.
>
> **The screen includes two options:** "Resend code" (with a short cooldown) and "Wrong email? Change it." The second one fixes a typo by updating the email on the unverified account and sending a fresh code. Without these, the step is a dead end for the exact mistake it exists to catch. Codes should expire after a short window.
>
> **Why it's required:** someone who mistypes their own email, or uses an address that isn't theirs, can journal for weeks without knowing. The real owner of that address could then use "Forgot password" and get into the journal. The real user would also never receive a reset email. Verification catches it while it can still be fixed. It also stops unverified accounts from squatting on someone else's email, which is what makes email-match account linking safe.
>
> **Older accounts:** the existing rule that you must verify before joining a circle stays as a backstop. Accounts created before this step existed (including test accounts) should be asked to verify the next time the app opens, not only when they try to join a circle.
>
> **Linking:** only verified emails should be able to trigger email-match account linking.

**Testing Phase:** ONBOARDING FLOW · **Category:** Save Progress / Account Creation

1. **Mobile screen:** "Verify your email" (inside the sign-up step), and the same code screen at app open for older accounts.
2. **Navigation:** Onboarding → Save your progress → Continue with Email → fill Name / Email / Create Password → **Create Account**. Older accounts: open the app signed in with an unverified email + password account.
3. **What to verify:** A 6-digit code arrives by email. You can't reach the paywall until it's entered. "Resend code" is greyed out for 60 s with a countdown ("You can ask for a new code in Ns."). "Wrong email? Change it." updates the address and sends a fresh code. A wrong code shows an error. Google / Apple sign-ups skip this screen. An older unverified account sees it at launch, before Home.
4. **Code:** `EmailCodeVerifier` (`src/features/email-verification/components/EmailCodeVerifier.tsx`), `EmailConfirmationScreen`, `AuthStep.tsx` (`mode === 'verify'`), gate `src/navigation/gate.ts` (`verifyEmail` stage), `RootNavigator.tsx`. Server: `request-email-verification`, `confirm-email-verification`, `_shared/accountSecurity.ts` (`RESEND_COOLDOWN_SECONDS = 60`, expiry, single use, lockout), migration `20261022100000_sign_in_security_codes.sql`.
5. **BEFORE (repo now):** As described. The email is sent by LYSM's own Edge Function through Resend.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Closing the app on the code screen brings you back to it (`arrivedWithEmail`). The circle-join verification stays as a backstop (`VerifyEmailToJoinScreen`). Email delivery depends on the Resend secrets (they existed before this round for invites; CANNOT VERIFY from the repo that they are set).
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] code email arrives [ ] blocked before paywall until verified [ ] Resend cooldown shown [ ] "Wrong email? Change it." works and sends to the new address [ ] wrong / expired code refused with message [ ] Google / Apple skip it [ ] old unverified account asked at app open
11. **Files requiring changes:** None.

---

### R34A — Paywall redesign + first reflection on the paywall (Part A of 3: sections 1, 2, 3, 5, 6, 8)

> R34 is split at the PDF's own numbered sections. Part A (onboarding) holds the intro and sections 1, 2, 3, 5, 6, 8. Part B (Phase 2, Journal) holds sections 4 and 7. Part C (Phase 2, Subscription) holds section 9.

**Original PDF Page:** 32–36

**Original Revision Text:**

> ● Paywall redesign + first reflection on the paywall
>
> I've attached images of both new paywall designs (the main paywall and the Welcome back paywall) so you can see exactly what they should look like. The main paywall replaces both current paywall screens (Annual and Monthly) with one screen.
>
> **1. Onboarding flow change**
>
> Remove the AI summary page that currently shows right after "Let's try your first check in."
>
> When the user taps "Save & reflect," run the concerning-words check first (see section 8). If the entry isn't flagged, send it to OpenAI right away, using the reflection tone they picked earlier in onboarding. The reflection should generate in the background while they create their account, so it's ready by the time they reach the paywall.
>
> If the user taps "Skip for now," generate the reflection from the answers they gave during onboarding instead, starting the moment they tap it.
>
> If the user picked two reflection tones in onboarding, the first reflection blends both, the same way regular reflections work now. This applies whether it's written from their entry or from their onboarding answers.
>
> The entry and reflection must be saved and attached to the user's account once they sign up, so nothing is lost.
>
> **2. Paywall layout (top to bottom)**
>
> Progress bar at the top, full.
>
> **Header:** "[First name], your reflection is waiting" in the serif heading font. The header should split evenly across two lines (balanced line breaks), so the name never ends up alone on a line, no matter how long it is.
>
> **Reflection card** (purple card):
>
> Small label at the top with the sparkle icon:
>
> If they journaled: "WRITTEN FOR YOU"
>
> If they skipped: "BASED ON YOUR ANSWERS"
>
> The first sentence of their real reflection, fully readable.
>
> The rest of the reflection blurred.
>
> A white pill under it with a lock icon: "Start your trial to read the rest"
>
> **Three benefits**, each with a purple checkmark:
>
> Understand your moods week by week
>
> Reflections written in the tone you chose
>
> Share with the people you trust
>
> **Plan cards**, stacked:
>
> **Annual** (selected by default): purple border, "Best value · Save 50%" tag in the top right corner, "5-day free trial" under the name. Price on the right: "$29.99/yr" as the main price, with "$59.88" crossed out and "$2.50/mo" in smaller text underneath. $29.99/yr must stay the biggest price on the card, since that's what users are actually charged (Apple requires this).
>
> **Monthly:** gray border, "No free trial" under the name, "$4.99/mo" on the right.
>
> Tapping a card selects it.
>
> **Trial timeline**, in one row: Today (Full access), Day 3 (We remind you), Day 5 (Trial ends).
>
> **Button:** "Start my 5-day free trial," with "No charge today. Cancel anytime." under it, and then "Restore purchases · Terms · Privacy" as links.
>
> **3. When Monthly is selected**
>
> Change the button to "Start monthly plan."
>
> Change the text under it to "Cancel anytime."
>
> Hide the trial timeline, since there's no trial on the monthly plan.
>
> **5. Edge cases**
>
> **Reflection still generating:** if the user reaches the paywall before the reflection is ready (for example, after a very fast Sign in with Apple), show "Writing your reflection..." in the card, then show the reflection as soon as it's ready.
>
> **Reflection fails to load:** show "Failed to load" in the card with a "Try again" button. Tapping it retries generating the reflection inside the card, without restarting the paywall or losing the user's plan selection.
>
> **Entry triggers the concerning-words check (onboarding):** the entry is saved privately with no AI reflection, and the crisis resources pop-up shows first. After they close it and reach the paywall, the reflection card uses the answers-based reflection, with the "BASED ON YOUR ANSWERS" label. The answers-based reflection is also saved as the "Welcome reflection" card at the top of the Journal tab, the same way it works when a user skips the check-in.
>
> **6. Streak**
>
> If the user journals on the "Let's try your first check in" page, that entry counts as day 1 of their streak.
>
> If they tap "Skip for now," it doesn't count, and their streak starts with their first real journal entry in the app.
>
> **8. Subscription and safety details**
>
> **Day 3 trial reminder:** the timeline promises "We remind you" on Day 3, so send a push notification on Day 3 of the free trial: "Your free trial ends in 2 days." Apple doesn't send this automatically, so it needs to be built.
>
> **Trial eligibility:** Apple and Google only give each account one free trial. Before showing the paywall, check whether the user is still eligible. If they're not (for example, they deleted the app and signed up again), change the button to "Start annual plan," change the text under it to "Cancel anytime," and hide "5-day free trial" on the Annual card and the trial timeline.
>
> **Prices from the stores:** don't hardcode any prices. Pull them from the App Store and Google Play, so users in other countries see the right price in their own currency. The crossed-out price should be the monthly price times 12, and the per-month price should be the annual price divided by 12, both calculated from the store prices.
>
> **Concerning-words check runs first:** check every entry for concerning words before it's sent to OpenAI. If it's flagged, it never gets sent, and the rules in section 7 apply.

**Testing Phase:** ONBOARDING FLOW · **Category:** First Check-in → Subscription / Paywall / Free Trial

1. **Mobile screens:** "Let's try your first check in." (Save & reflect / Skip for now) → Save your progress → **Paywall** (step 15).
2. **Navigation:** Onboarding → First check in → **Save & reflect** (or **Skip for now**) → plan checklist → Save your progress → sign up → paywall.
3. **What to verify:** No AI summary page after the check-in. Paywall top to bottom: full progress bar; "[First name], your reflection is waiting" on two balanced lines; purple card with ✨ and "WRITTEN FOR YOU" (journaled) or "BASED ON YOUR ANSWERS" (skipped or flagged); first sentence readable, the rest blurred; white pill with 🔒 "Start your trial to read the rest"; three purple-check benefits; Annual (selected, purple border, "Best value · Save 50%", "5-day free trial", $29.99/yr biggest, $59.88 crossed out, $2.50/mo); Monthly (gray border, "No free trial", $4.99/mo); timeline Today / Day 3 / Day 5; button "Start my 5-day free trial", "No charge today. Cancel anytime.", "Restore purchases · Terms · Privacy". Tap Monthly: "Start monthly plan", "Cancel anytime.", no timeline. If you get there quickly: "Writing your reflection..." then the text. Compare with `p32-paywall-main.png`.
4. **Code:** `TrialStep` (`src/features/onboarding/screens/steps/TrialStep.tsx`); `FirstReflectionCard`, `BlurredText`, `PaywallParts` (`PaywallHeader`, `BenefitList`, `PlanCards`, `TrialTimeline`, `PaywallFooter`) in `src/features/subscription/components/`; copy in `src/features/subscription/paywallCopy.ts`; `src/features/subscription/firstReflection.ts`; `usePaywallMode` (`src/features/subscription/hooks.ts`); `src/features/iap/`; first check-in in `FirstCheckinStep.tsx` (`useGenerateSummary`, `useStartWelcomeReflection`, `useEntryCrisisCheck`); Day 3 reminder in `src/features/onboarding/hooks.ts:170-185` + `copy.ts` (`trialReminderMessage`); server `welcome-reflection`, `ai-summary`, `validate-purchase`.
5. **BEFORE (repo now):** All texts match the PDF. The header falls back to "Your reflection is waiting" if there's no name. The Day 3 reminder title is the client's sentence; its body adds the renewal date, price and how to cancel. The first check-in entry is a normal journal entry, so it counts toward the streak. Skipping creates no entry.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The plan choice survives "Try again" (it is kept in `TrialStep` state). Trial eligibility uses the store's offer when selling through the stores; otherwise the server's one-trial-per-account rule. **On build 12 the store products don't exist yet**, so the app uses its own 5-day trial, shows the default prices, and the paid buttons say purchases aren't available right now. The Day 3 reminder is a notification scheduled on the phone, so it needs notification permission.
8. **Code status:** **IMPLEMENTED** in code. Store prices, store trial eligibility and paid purchases are **not testable live** until the store products and IAP secrets exist.
9. **Mobile Testing Status:** NOT TESTED (store-price and purchase parts **BLOCKED** until store setup)
10. **Checklist:** [ ] no AI summary page after check-in [ ] journaled → "WRITTEN FOR YOU" [ ] skipped → "BASED ON YOUR ANSWERS" [ ] flagged entry → crisis sheet first, then "BASED ON YOUR ANSWERS" [ ] two-line balanced header, name never alone [ ] first sentence clear, rest blurred [ ] pill text exact [ ] 3 benefits exact [ ] Annual card details, $29.99/yr biggest [ ] Monthly card details [ ] Monthly → button, note, no timeline [ ] "Writing your reflection..." state [ ] "Failed to load" + Try again keeps plan [ ] Restore / Terms / Privacy links [ ] journaled check-in = streak day 1 on Home [ ] skip → streak 0 [ ] Day 3 reminder (test account: trial start + 3 days)
11. **Files requiring changes:** None in code. Setup: store products, IAP secrets.

---

### R16 — "You're all set" trial confirmation icon + animation

**Original PDF Page:** 11

**Original Revision Text:**

> ● On the "You're all set" trial confirmation screen, the icon in the middle changes — screen recording of the target animation is attached below.
>
> **What it looks like now, and what it's replacing:** currently a checkmark circle surrounded by a lighter purple halo ring, with several small colored dots scattered around it. Remove the halo ring and all the dots entirely.
>
> **What it should be instead:** just a solid purple circle with a white checkmark inside it. Nothing else around it.
>
> **Entrance animation, plays once when the screen appears, then holds still:**
>
> 1. The purple circle pops in first — scales up from slightly smaller to full size while fading in, with a slight bounce/overshoot on the scale rather than a flat linear motion.
> 2. Right after the circle settles, the checkmark draws itself in with a quick stroke animation — it should look like it's being drawn stroke-by-stroke, not just fading into view all at once.
> 3. Once the checkmark finishes drawing, everything holds completely still. No looping, no continuous pulsing — this is a one-time entrance, not an ongoing animation.
>
> Total sequence should feel quick, well under a second — the recording attached shows the actual intended timing and feel.

**Testing Phase:** ONBOARDING FLOW · **Category:** Trial Confirmation

1. **Mobile screen:** "You're all set." (step 16, after the paywall).
2. **Navigation:** Onboarding → paywall → **Start my 5-day free trial** → confirmation.
3. **What to verify:** Solid purple circle with a white check, no halo, no dots. The circle pops in (scale 0.8 → 1 with a slight overshoot, fading in), then the check draws itself short stroke first, then the long one. About 0.64 s total, then still. Compare with `p11-youre-all-set-animation.mov`.
4. **Code:** `AllSetCheck` (`src/features/onboarding/components/AllSetCheck.tsx`), geometry and timing in `src/features/onboarding/allSetCheck.ts` (`ALL_SET_CHECK`: fade 200 ms, pop 320 ms, overshoot 1.7, check delay 320 ms, draw 320 ms), `ConfirmStep.tsx`.
5. **BEFORE (repo now):** As described. With Reduce Motion on, it shows the finished icon (`AllSetCheckReducedMotion.test.tsx`).
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The screen first shows "Confirming your subscription…" until the server confirms access.
8. **Code status:** **IMPLEMENTED.** The feel against the recording can only be judged on a phone.
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] no halo, no dots [ ] circle pops with overshoot + fade [ ] check draws stroke by stroke after the circle settles [ ] under a second [ ] plays once, no loop or pulse [ ] matches recording
11. **Files requiring changes:** None.

---

### R8 — Notifications page in onboarding: small updates

**Original PDF Page:** 4

**Original Revision Text:**

> ● Notifications page in onboarding: small updates
>
> 1. Change "Early Evening" to "Early evening," so it matches the style of the other options.
> 2. Change "Add one later" to "Maybe later."
> 3. Preselect "Before bed (9:00 PM)" when the page opens, so the "Turn on reminders" button is active right away. The user can still tap any other option to change it.
> 4. Add a small line of gray text right under the "Custom time" option: "You can change this anytime in Profile → Notifications."

**Testing Phase:** ONBOARDING FLOW · **Category:** Final Onboarding / Transition to Home

1. **Mobile screen:** The onboarding notifications page (last step, after "You're all set").
2. **Navigation:** Onboarding → paywall → You're all set → **Continue**.
3. **What to verify:** Options read Morning / Early afternoon / **Early evening** / Before bed (9:00 PM) / Custom time. **Before bed is already selected** and "Turn on reminders" works at once. Gray line under Custom time: "You can change this anytime in Profile → Notifications." The second button reads "Maybe later".
4. **Code:** `NotificationsStep` (`src/features/onboarding/screens/steps/NotificationsStep.tsx:53-57, 114, 228-255`).
5. **BEFORE (repo now):** `PRESETS` label "Early evening"; `useState<ReminderChoice>('bedtime')`; buttons "Turn on reminders" / "Maybe later"; caption line under Custom time.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** "Before bed" shows its time (9:00 PM) as a second line under the label, not in brackets on the same line. "Maybe later" still saves the selected time. The OS permission prompt appears only from "Turn on reminders". This step finishes onboarding → Home.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] "Early evening" [ ] "Maybe later" [ ] Before bed preselected, button active [ ] other options selectable [ ] gray helper line under Custom time
11. **Files requiring changes:** None.

---

### Cross-references into onboarding (tested in Phase 2)

- **R9 Verified badges, point 3:** check-mark characters blocked in the **Name** field on "Save your progress → Continue with Email" (message "Names can't include check marks or verification symbols."). `src/features/auth/schema.ts` `signupSchema` → `src/utils/nameSymbols.ts`.
- **R34B section 7:** the concerning-words rule also applies on the first check-in (covered in R34A section 5 above).
- **R13 item 8:** no banners during onboarding, paywall, sign-in or sign-up, or while the crisis pop-up is open.

### Onboarding completion summary

| | Count |
|---|---|
| Onboarding revision entries | **10** (R32, R17, R12, R33, R15, R21, R23A, R34A, R16, R8) |
| Implemented (code) | **10** |
| Partially implemented | 0 |
| Not implemented | 0 |
| Cannot verify | 0 (live parts of R21 and R34A depend on backend setup, see the table at the top) |
| Mobile testing pending | **10 of 10** |

---

## PHASE 2 — IN-APP UI

Tabs (`src/navigation/MainNavigator.tsx`): **Journal**, **Insights**, **Circles**, **Profile**.

### Home Screen / Journal tab

---

### R6 — Update the empty Journal tab for new users

**Original PDF Page:** 3

**Original Revision Text:**

> ● Update the empty Journal tab for new users
>
> 1. **Greeting:** when a user first joins and has no entries, the header currently says "Hello, there." Change it to use the same time-of-day greeting with the user's first name that the Journal tab already uses for everyone else (for example, "Good afternoon, Konah"). There should always be a name saved, it needs to pull a name 100 percent of the time.
> 2. **Empty journal text:** in the "Your journal is empty" card, change "Tap the + button to log your first mood and write what's on your mind." to: "Tap + New Entry to log your first mood and write what's on your mind."

**Testing Phase:** IN-APP UI · **Category:** Home Screen / Dashboard

1. **Mobile screen:** Journal tab (`JournalHome`).
2. **Navigation:** A new account that skipped the first check-in (so it has no entries) → finish onboarding → Journal tab.
3. **What to verify:** Header "Good morning / Good afternoon / Good evening, [first name]" (5–12 / 12–17 / 17+), never "Hello, there". The card "Your journal is empty" reads "Tap + New Entry to log your first mood and write what's on your mind."
4. **Code:** `JournalHomeScreen` (`src/features/journal/screens/JournalHomeScreen.tsx:24-26, 101-103`), `homeGreeting` (`src/features/journal/logic.ts:130-142`), name fill (R15).
5. **BEFORE (repo now):** As described. Before 5 AM the greeting is "Hello, [name]". While the profile is still loading, the greeting shows without a name, never "there".
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The name comes from the sign-up form, Google or Apple, else the email's first part (R15).
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] time-of-day greeting + first name with 0 entries [ ] email, Google and Apple sign-ups all show a name [ ] empty card text exact
11. **Files requiring changes:** None.

---

### R11 — Today's Moods card opens a new entry when tapped anywhere

**Original PDF Page:** 6

**Original Revision Text:**

> ● On the home page, the "Today's Moods" card should open a new journal entry when tapped anywhere within it, not just when tapping directly on one of the mood circles. Right now, tapping a mood circle already opens a new entry — that behavior should stay exactly as it is. The fix is to extend that same tap target to the rest of the card, so tapping the card background, the header, or any other empty space within the section also opens a new entry, the same as tapping a mood does now.

**Testing Phase:** IN-APP UI · **Category:** Home Screen / Dashboard

1. **Mobile screen:** Journal tab → "Today's Mood" card.
2. **Navigation:** Journal tab.
3. **What to verify:** Tapping a mood opens New Entry with that mood preselected (unchanged). Tapping the header, the background or empty space opens New Entry with nothing preselected.
4. **Code:** `TodaysMoodCard` (`src/features/journal/components/TodaysMoodCard.tsx`, `onPressCard`), `JournalHomeScreen.tsx:54-55`.
5. **BEFORE (repo now):** `onPickMood` → `NewEntry {presetMood}`; `onPressCard` → `NewEntry`.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Test: `JournalHomeTodaysMoodsTap.test.tsx`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] mood tap → preset mood [ ] header tap → New Entry [ ] empty space tap → New Entry [ ] streak indicator area tap → New Entry
11. **Files requiring changes:** None.

---

### R20 — Today's Moods streak indicator: use real 🔥 and ⏳ emoji

**Original PDF Page:** 15

**Original Revision Text:**

> ● On the Today's Moods card, the streak indicator in the top-right corner (hourglass + flame + number, shown in the urgent state) currently uses custom-drawn icons that look off — not like real emoji, more like generic line-art approximations of them.
>
> Fix: use the actual native emoji characters instead of custom icons — 🔥 for the flame and ⏳ for the hourglass. These should render as the real, full-color emoji built into the phone (Apple's on iPhone, the phone's own on Android), not a custom SVG or icon-font substitute standing in for them.

**Testing Phase:** IN-APP UI · **Category:** Home Screen / Dashboard

1. **Mobile screen:** Journal tab → Today's Mood card, top right.
2. **Navigation:** An account with a streak of 1 or more. For the urgent state: after 8 PM local time, with no entry yet today.
3. **What to verify:** 🔥 + number in the full-color system emoji. After 8 PM without an entry: ⏳ 🔥 + a red number.
4. **Code:** `TodaysMoodCard.tsx:28-64` (`STREAK_FLAME = '\u{1F525}'`, `STREAK_HOURGLASS = '⏳'` U+23F3).
5. **BEFORE (repo now):** Emoji characters, no icons.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The emoji are sized to keep the old icons' footprint.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] 🔥 is the real emoji (iPhone and Android) [ ] urgent state shows real ⏳ [ ] number red in urgent state
11. **Files requiring changes:** None.

---

### R34B — Paywall spec (Part B of 3: section 4 "Saving the reflection in the app" + section 7 "Entries with concerning words")

**Original PDF Page:** 34–36

**Original Revision Text:**

> **4. Saving the reflection in the app**
>
> **If they journaled:** the reflection is attached to their first journal entry, like any other entry, so they can open it from the Journal tab and read the full thing.
>
> **If they skipped:** save the answers-based reflection as a "Welcome reflection" card at the top of the Journal tab. Tapping it opens the full reflection.
>
> The card stays there until the user chooses to delete it. It should never disappear on its own.
>
> Add a small ••• menu on the card with a "Delete" option. Before deleting, show a confirmation: "Delete your welcome reflection? This can't be undone." with "Delete" and "Cancel" buttons.
>
> This way, "Start your trial to read the rest" is always true.
>
> **7. Entries with concerning words (applies everywhere: onboarding and the app)**
>
> **Save the entry privately**, like any other entry, so the user never loses what they wrote.
>
> **Show the crisis resources pop-up** as soon as the entry is saved.
>
> **Don't generate an AI reflection** for that entry. Where the reflection would normally show, show a short message with the crisis resources instead: "You don't have to carry this alone. Talking to someone can help, right now," followed by the 988 and Crisis Text Line options.
>
> **Block sharing for that entry.** It can't be shared to any circle, public or private. If the user tries, show: "This entry can't be shared, but support is always available," with a link to the crisis resources.

**Testing Phase:** IN-APP UI · **Category:** Mood Tracking & Daily Check-ins / Reflections

1. **Mobile screens:** Journal tab (Welcome reflection card, entry list), Entry Detail, New Entry (share options).
2. **Navigation:** (a) Journaled in onboarding → Journal tab → open the first entry. (b) Skipped in onboarding → Journal tab top → Welcome reflection card → tap it; ••• → Delete. (c) Journal → + New Entry → mood + a note with a concerning phrase → Save; then open that entry and try to share it.
3. **What to verify:** (a) The full reflection is on the first entry. (b) The "Welcome reflection" card is at the top, opens the full text, stays put, and ••• → Delete asks "Delete your welcome reflection?" / "This can't be undone." with Delete and Cancel. (c) The entry is saved, the crisis pop-up shows, there is no AI reflection, and the support message plus 988 and Crisis Text Line appear in its place. Sharing shows "This entry can't be shared, but support is always available." with "See crisis resources".
4. **Code:** `WelcomeReflectionCard` (`src/features/welcome-reflection/components/WelcomeReflectionCard.tsx:23-31`), `src/features/welcome-reflection/api.ts`; `EntryDetailScreen.tsx:28, 92` (`CrisisSupportMessage`); `NewEntryScreen.tsx:81-90, 163-168, 256-289, 372` (`EntryNotShareable`, `useEntryCrisisCheck`); `src/features/crisis/copy.ts`; DB flag `crisis_flagged` (migration `20261022120000_crisis_words_entries.sql`); server re-check `_shared/crisisWords.ts`.
5. **BEFORE (repo now):** As described. The two client sentences end with a period in the app; the PDF wrote them mid-sentence with a comma.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Editing an entry to add concerning words also triggers the rule (`NewEntryEditCrisisWords.test.tsx`). The server flag is the authority. A flagged entry is left out of weekly / monthly / yearly reflections' look-back.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] journaled → first entry has full reflection [ ] skipped → Welcome reflection card on top [ ] card opens full reflection [ ] card persists after restart [ ] ••• Delete confirm text exact; Cancel keeps it [ ] flagged entry saved [ ] crisis pop-up after save [ ] no AI reflection, support message + 988 + Crisis Text Line [ ] sharing blocked with exact message + link
11. **Files requiring changes:** None.

---

### R27 — Streak Popup Spec

**Original PDF Page:** 24–27

**Original Revision Text:**

> ● Streak Popup Spec
>
> **1. Layout**
>
> Keep the current popup design (buttons, styling), but remove the checkmark icon at the top. Replace the headline "1 day journaling, and counting" with three parts, stacked and centered. See the attached screenshot for the exact look.
>
> The flame emoji and the user's current streak number side by side on one line, close together, with the number large and bold in the same serif font as the app's headings
>
> "DAY STREAK" in smaller text directly under the number
>
> A message line under that, in smaller, softer text (see the rules below)
>
> The streak number must always match the streak shown on the Journal tab, Insights, and Profile.
>
> **2. Buttons**
>
> Keep "See AI summary" as is.
>
> Change "Go back to home" to "Back to home."
>
> **3. Which message to show**
>
> Each day gets one message. Check these in order and use the first one that applies:
> 1. Starting over after a broken streak
> 2. Milestone day
> 3. New longest streak
> 4. Day before a milestone
> 5. Regular day
>
> **4. Milestone messages**
>
> Day 1: Great start. Come back tomorrow to make it 2.
>
> Day 3: 3 days in a row. You're building something here. See you tomorrow.
>
> Day 7: One full week! Let's start week two tomorrow.
>
> Day 14: Two weeks of checking in. Keep it going tomorrow.
>
> Day 30: A whole month of showing up. Keep it going tomorrow.
>
> Day 50: 50 days. Halfway to 100. See you tomorrow.
>
> Day 100: 100 days. Tomorrow starts the next hundred.
>
> Day 150: 150 days of showing up for yourself. See you tomorrow.
>
> Day 200: 200 days. That's who you are now. See you tomorrow.
>
> Day 250: 250 days. A quarter of the way to 1,000. See you tomorrow.
>
> Day 300: 300 days. One year is right around the corner.
>
> Day 365: One full year of journaling. Tomorrow starts year two.
>
> Day 500: 500 days. Few people ever get here. See you tomorrow.
>
> Day 1,000: 1,000 days. Truly incredible. See you tomorrow.
>
> After day 365, these also count as milestones:
>
> **Every yearly anniversary** (730, 1,095, 1,460, and so on): "[Y] years of journaling. Tomorrow starts year [Y+1]." Here [Y] is the number of years.
>
> **Every 100 days not listed above** (400, 600, 700, 800, 900, 1,100, and so on): "[X] days. See you tomorrow for [X+1]."
>
> If a day is both a yearly anniversary and on another list, use the anniversary message.
>
> **5. New longest streak**
>
> "Your longest streak yet. Let's beat it again tomorrow."
>
> Show this only on the first day the user passes their previous longest streak, not on every day after.
>
> Never show it during a user's first-ever streak.
>
> **6. Day before a milestone**
>
> Tomorrow is day [X]. Don't miss it.
>
> [X] is the next milestone day. This applies to every milestone in section 4, including anniversaries and every-100-days milestones. For example, on day 29: "Tomorrow is day 30. Don't miss it."
>
> **7. Starting over after a broken streak**
>
> If the user is on day 1 but has had a streak before, show this instead of the regular day 1 message:
>
> Every streak starts with day 1. Come back tomorrow to make it 2.
>
> **8. Regular days**
>
> For any day that doesn't fit the rules above, randomly pick one of these lines:
>
> See you tomorrow for day [X+1].
>
> Day [X] done. Tomorrow makes [X+1].
>
> Another day for you. See you tomorrow.
>
> Keep showing up. Day [X+1] is tomorrow.
>
> Do not show the same line two days in a row.
>
> **9. Formatting**
>
> Replace [X] with the user's current streak number, and [X+1] with the next day's number.
>
> Use commas in numbers 1,000 and higher.
>
> **10. More than one entry on the same day**
>
> The streak popup only shows for the user's first entry of the day. For a second, third, or later entry on the same day, keep showing the current "Entry complete" popup instead, since the streak doesn't go up.

**Testing Phase:** IN-APP UI · **Category:** Mood Tracking & Daily Check-ins

1. **Mobile screen:** The popup after saving a new entry (`EntryCompletionModal`).
2. **Navigation:** Journal → + New Entry → mood + note → Save Entry.
3. **What to verify:** First entry of the day: no checkmark; 🔥 + big serif number; "DAY STREAK"; a message line; "See AI summary" and "Back to home". The number equals Journal, Insights and Profile. Second entry the same day: the "Entry complete" popup. Compare with `p24-streak-popup.png`.
4. **Code:** `EntryCompletionModal` (`src/features/journal/components/EntryCompletionModal.tsx:31-101`), messages in `src/features/journal/streakMessages.ts` (milestones, `STARTING_OVER_MESSAGE`, `NEW_LONGEST_MESSAGE`, `REGULAR_LINES`, `regularLineIndex`), `src/features/journal/streakMilestones.ts`, `NewEntryScreen.tsx`; migration `20261022020000_streak_milestones.sql`.
5. **BEFORE (repo now):** All messages match word for word. The regular-day line is a hashed pick that never repeats the previous day's line (the same on every device, nothing stored).
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Day-specific messages need specific streak counts; most are covered by unit tests. On the phone you can realistically check day 1, day 1 after a broken streak, day 2 (day before 3), day 3, and a regular day.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] no checkmark icon [ ] 🔥 + serif number, "DAY STREAK", message line [ ] "Back to home" label [ ] number matches the other 3 places [ ] Day 1 message (new user) [ ] Day 1 after broken streak → "Every streak starts with day 1…" [ ] Day 2 → "Tomorrow is day 3. Don't miss it." [ ] Day 3 milestone text [ ] 2nd entry same day → "Entry complete"
11. **Files requiring changes:** None.

---

### Reflections & Insights

---

### R3 — Update the "not ready yet" text on the Insights tab

**Original PDF Page:** 1–2

**Original Revision Text:**

> ● Update the "not ready yet" text on the Insights tab
>
> When the user has entries but their mood breakdown and reflection for the selected period aren't ready yet:
>
> 1. **Mood Breakdown card:** change "Your mood patterns will appear here once your [weekly/monthly/yearly] reflection unlocks. Unlocks on [date]." to:
>
>    Your mood breakdown will show here after a full [week/month/year] of journaling.
>
>    Ready on [date].
>
>    All text in this card should be centered.
>
> 2. **Reflection card:** change "Keep Journaling. Your [Weekly/Monthly/Yearly] Reflection will unlock after a full [week/month/year] of journaling! Your next reflection will be ready on [date]." to:
>
>    Your [weekly/monthly/yearly] reflection will show here after a full [week/month/year] of journaling. Keep going!
>
>    Ready on [date].
>
>    All text in this card should stay left-aligned, including the "[WEEKLY/MONTHLY/YEARLY] REFLECTION" label.
>
> 3. The words change to match the selected tab, and the date is the day it'll be ready (for example, "Ready on September 7, 2027").

**Testing Phase:** IN-APP UI · **Category:** Reflections & AI-generated Content

1. **Mobile screen:** Insights tab, Mood Breakdown + Reflection cards.
2. **Navigation:** Account (d): has entries, first entry less than 7 days ago → Insights → Week, then Month, then Year.
3. **What to verify:** Mood Breakdown (centered): "Your mood breakdown will show here after a full week of journaling." / "Ready on [Month D, YYYY]." Reflection (left-aligned, label too): "Your weekly reflection will show here after a full week of journaling. Keep going!" / "Ready on …". Words and dates change per tab, and both cards show the same date.
4. **Code:** `InsightsScreen` (`src/features/insights/screens/InsightsScreen.tsx:136-160` `MoodBreakdownNotReady`), `src/features/reflections/logic.ts:18-68` (`NOT_READY` texts, `readyOnSentence`), `src/features/reflections/components/ReflectionCard.tsx:43`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The date is the reflection's `nextUnlockDate`, so both cards agree. Test: `InsightsNotReady.test.tsx`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] breakdown text exact, centered [ ] reflection text exact, left-aligned incl. label [ ] Week / Month / Year words change [ ] "Ready on Month D, YYYY" format [ ] same date on both cards
11. **Files requiring changes:** None.

---

### R7 — Update the empty state on the Insights tab (no entries)

**Original PDF Page:** 4

**Original Revision Text:**

> ● Update the empty state on the Insights tab
>
> When the user hasn't made any journal entries yet:
>
> 1. Change the section label above the card from "MOOD BREAKDOWN" to "MOODS & REFLECTIONS."
> 2. Change the text in the card from "Your mood patterns will appear here once your weekly reflection unlocks." to:
>
>    **Week tab:** "Start journaling to see your mood breakdown and weekly reflection here."
>
>    **Month tab:** "Start journaling to see your mood breakdown and monthly reflection here."
>
>    **Year tab:** "Start journaling to see your mood breakdown and yearly reflection here."
>
> This only applies when the user has no entries. Once they make their first entry, the screen switches to the normal layout, with the "MOOD BREAKDOWN" and "REFLECTIONS" sections like it does now.

**Testing Phase:** IN-APP UI · **Category:** Reflections & AI-generated Content

1. **Mobile screen:** Insights tab.
2. **Navigation:** Account (c), with no entries (skipped the first check-in) → Insights.
3. **What to verify:** One card under "MOODS & REFLECTIONS" with the tab-specific text. No separate Reflections section. Add an entry → back to Insights → normal layout with "MOOD BREAKDOWN" + Reflections.
4. **Code:** `InsightsScreen.tsx:140-143` (`noEntriesText`), `:226-231` (`noEntries` from server `hasAnyEntry`), `:299-301` (label), `ReflectionsSection` hides on the same flag.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** "Unknown" counts as having entries, so the normal layout is the safe default. Tests: `InsightsNoEntries.test.tsx`, `InsightsFirstEntry.test.tsx`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] label "MOODS & REFLECTIONS" [ ] Week / Month / Year texts exact [ ] no Reflections section [ ] first entry → normal layout
11. **Files requiring changes:** None.

---

### R19 — Bug: empty period keeps showing stale reflection / mood breakdown

**Original PDF Page:** 13–14

**Original Revision Text:**

> ● Bug: when a period has zero journal entries, the Weekly Reflection card (and, it turns out, the Mood Breakdown card as well — see Fix below) doesn't show an empty state — it keeps displaying stale content from a completely different, earlier period, while still labeling it with the current period's date range.
>
> Reported case: entries were made during Sep 14–20, and the reflection text (workout, getting matcha with Augie, etc.) is genuinely correct for that period — that part worked as expected. The empty period tested was the following week, Sep 21–27, where no entries were made at all. Once that period ended, the card should have advanced to Sep 21–27 and shown an empty state for it, but instead it stayed completely frozen on the Sep 14–20 reflection — both the date label and the content. The bug is that a period with zero entries doesn't cause the card to advance at all; it just gets stuck displaying the last period that actually had content.
>
> Fix: this applies to both the Weekly Reflection card and the Mood Breakdown card — both need the same empty-state behavior when a period has zero entries, not just Reflection. Neither should get stuck showing an old period's content when the current one is empty.
>
> Wording should be consistent between the two cards, closely matching Mood Breakdown's existing empty-state pattern rather than introducing separate phrasing for each: Mood Breakdown already says "No entries in this period yet. Log a mood to see your patterns here." — Reflection should follow the same structure, something like "No entries in this period yet. Journal to see your reflection here."
>
> Important: this empty state is not permanent, but it also doesn't refresh early just because a user starts journaling again — it follows the exact same once-per-period locking schedule as everything else, not an instant update the moment a new entry is logged. Example: Sep 21–27 has zero entries, so the empty state appears on Sep 28 (when that period would normally unlock) and stays displayed through the entire next period, Sep 28–Oct 4 — even if the user resumes journaling on Sep 28, the empty state for Sep 21–27 stays on screen the whole time, since Sep 28–Oct 4's own reflection isn't ready yet. Only on Oct 5, when Sep 28–Oct 4 unlocks, does the card update — and only then does it show a real reflection, assuming the user actually journaled during that period. If Sep 28–Oct 4 also ends up with zero entries, the card would show the empty state again on Oct 5, not a fallback to Sep 21–27's empty state or anything else.
>
> The empty state doesn't replace the whole card, just the main reflection text. The surrounding metadata should still show exactly as it does for a real reflection — "Reflecting on [date range]" for the period that was empty, and "Your next reflection will be ready on [date]" below it. A user should still be able to see which period had nothing logged and when the next one unlocks, even while looking at the empty state. This applies to the Mood Breakdown card too, with whatever equivalent period/next-ready information it should be showing alongside its own empty-state message.
>
> This should apply to all three views — weekly, monthly, and yearly — for both cards, not just weekly, same as the original locking spec.
>
> **Notification behavior for empty periods:** the weekly, monthly, and yearly reflection notifications (from the main Notifications spec) should only fire when a period unlocks with a real reflection actually generated from real entries. If a period is empty and shows the empty state instead, the notification should not fire at all — this holds regardless of whether the user has that notification setting enabled. No "your recap is ready" notification should ever lead to an empty state on the other end; if there's nothing real to show, there's nothing to notify about. Applies uniformly to weekly, monthly, and yearly.

**Testing Phase:** IN-APP UI · **Category:** Reflections & AI-generated Content (+ Notifications)

1. **Mobile screen:** Insights tab, both cards, Week / Month / Year.
2. **Navigation:** Account (e): the last finished week had zero entries → Insights → Week.
3. **What to verify:** Mood Breakdown: "No entries in this period yet. Log a mood to see your patterns here." plus "Your moods from [range]" and "Your breakdown will be ready on [date]." Reflection: "No entries in this period yet. Journal to see your reflection here." plus "Reflecting on [empty range]" and "Your next reflection will be ready on [date]." A new entry today doesn't change it until the next unlock. No reflection notification for the empty period.
4. **Code:** `InsightsScreen.tsx:66-67, 243-279` (`BREAKDOWN_EMPTY`, `empty = locked?.hasEntries === false`), `src/features/reflections/logic.ts:27` (`REFLECTION_EMPTY`), `ReflectionCard.tsx:77-89`, `src/features/insights/api.ts:57-74` (`hasEntries: r.has_entries ?? true`), `src/features/reflections/api.ts:44`; migration **`20261020110000_insights_empty_periods.sql`**; recap push only for real reflections in migration `20261021150500` and `recap-notifications`.
5. **BEFORE (repo now):** The app handles the empty state, but **it relies on the migration's new `has_entries` column**. Without it the app defaults to `true` (has entries), and the server still returns the newest period **with** entries, which is the old stuck behavior.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The migration is **step 3, not yet applied to production** (`DEPLOY.md`). Until then, build 12 still shows the bug.
8. **Code status:** **IMPLEMENTED** (app + migration in the repo). **Not live:** migration pending.
9. **Mobile Testing Status:** NOT TESTED (expect **FAIL / BLOCKED** until migration `20261020110000` is applied)
10. **Checklist (after step 3):** [ ] Week empty state + "Reflecting on" + next date [ ] breakdown empty state + "Your moods from" + "ready on" [ ] Month and Year same behavior [ ] new entry doesn't change it before the next unlock [ ] no "reflection ready" push for the empty period
11. **Files requiring changes:** None in code. Deploy: apply `20261020110000_insights_empty_periods.sql` (step 3).

---

### R30 — Add dates to the Mood Breakdown card

**Original PDF Page:** 29–30

**Original Revision Text:**

> ● Add dates to the Mood Breakdown card
>
> At the bottom of the Mood Breakdown card on the Insights tab, add two lines of small text, styled the same way as the dates at the bottom of the Weekly Reflection card:
>
> "Your moods from [start date] to [end date]" (for example, "Your moods from Sep 28 to Oct 4")
>
> "Your breakdown will be ready on [date]." (for example, "Your breakdown will be ready on October 12, 2026.")
>
> This applies to the weekly, monthly, and yearly views. The dates should update to match whichever view is selected, and cover the same period as that view's reflection. These two date lines only show once a mood breakdown is showing. Before that, the "not ready yet" text replaces them, so both never show at the same time.

**Testing Phase:** IN-APP UI · **Category:** Reflections & AI-generated Content

1. **Mobile screen:** Insights tab → Mood Breakdown card.
2. **Navigation:** An account with a finished week, month or year that has entries → Insights → each tab.
3. **What to verify:** Under the bars: "Your moods from Sep 28 to Oct 4" and "Your breakdown will be ready on October 12, 2026.", styled like the Reflection card's dates. Not shown together with the "not ready yet" text.
4. **Code:** `InsightsScreen.tsx:69-89` (`BreakdownDates`), `:233-236`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Also shown under the empty-period state (R19 asks for that). The "ready on" date is the same `nextUnlockDate` the reflection uses.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] both lines present and formatted [ ] update per tab [ ] same period as reflection [ ] not shown with "not ready yet"
11. **Files requiring changes:** None.

---

### Circles — Private & Public

---

### R14 — Update the "No circles yet" text on the Circles tab

**Original PDF Page:** 9–10

**Original Revision Text:**

> ● Update the "No circles yet" text on the Circles tab
>
> On the Circles tab, change the text in the "No circles yet" card to:
>
> "Create a circle and invite people, or join one with a code. Once you're in one, you can share your mood along with your AI reflection or written entry, and post with others in the circle."
>
> The title "No circles yet" stays the same. This card should only show when the user isn't in any circles. Once they create or join one, it's replaced by their list of circles.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screen:** Circles tab.
2. **Navigation:** An account in no circles → Circles tab.
3. **What to verify:** Title "No circles yet" + the exact text. Join or create a circle → the card is replaced by the list.
4. **Code:** `MyCirclesScreen` (`src/features/circles/screens/MyCirclesScreen.tsx:21-23, 161-169`).
5. **BEFORE (repo now):** Exact text. A load error shows an error instead of this card.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] title unchanged [ ] text exact [ ] gone once in a circle
10. **Files requiring changes:** None.

---

### R4 — Circles Tab: Order of Circles

**Original PDF Page:** 2

**Original Revision Text:**

> ● Circles Tab: Order of Circles
>
> 1. The circles under YOUR CIRCLES should be sorted by most recent activity, with the most recently active circle at the top.
> 2. Activity means a new post or a new reply in that circle, from anyone, including the user.
> 3. When a circle gets new activity, it moves to the top of the list.
> 4. When a user joins or creates a circle, that also counts as activity, so the new circle goes to the top of their list. If nothing happens in that circle after that, it moves lower as their other circles get new posts and replies.
> 5. Archived circles always stay at the bottom of the list, below all active circles. Among themselves, they follow the same order: most recent activity first.
> 6. The order should update in real time. If someone posts in a circle while the user is on the Circles tab, that circle moves to the top without the user needing to refresh.
> 7. This applies to every circle in the list, Public or Private, whether the user is the owner or a member.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screen:** Circles tab → YOUR CIRCLES.
2. **Navigation:** An account in 3+ circles → Circles tab. From a second phone or account, post or reply in the bottom circle.
3. **What to verify:** It jumps to the top **without refreshing**. A newly created or joined circle is at the top. Archived circles stay at the bottom, most recent first among themselves.
4. **Code:** `MyCirclesScreen.tsx:46-58, 132-135` (`archivedLast`, `useMyCircles({ live: true })`), `src/features/circles/myCirclesOrder.ts` (`compareMyCircles`, `activityFor`), `hooks.ts`; migration `20261022040000_circles_activity_order.sql` (`my_circles_by_activity`).
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Live reordering needs Realtime on circles and memberships (added during deploy). The migration is deployed (step 1).
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] sorted by activity [ ] your own post moves it up [ ] other's reply moves it up live [ ] new or joined circle on top [ ] archived at bottom [ ] Public + Private, owner + member
11. **Files requiring changes:** None.

---

### R5 — Circles Tab: Colored Icons on Circle Cards

**Original PDF Page:** 3

**Original Revision Text:**

> ● Circles Tab: Colored Icons on Circle Cards
>
> See the attached screenshot for how it should look.
>
> 1. The Circles tab stays as it is now. The header, subtitle, the Create a circle and Discover circles cards, the YOUR CIRCLES label, and the bottom tabs don't change.
> 2. The only change is to the circle cards under YOUR CIRCLES. Each card gets a colored circle icon on the left side, next to the circle's name.
>    ○ Public Circles get a light green circle (#B9E8CB) with a dark green globe icon (#1F5C3C).
>    ○ Private Circles get a light purple circle (#EADBF8) with a dark purple lock icon (#5A1F9A).
> 3. The icon circle should be about 46px wide, vertically centered in the card, with about 12px of space between it and the text.
> 4. Remove the small globe or lock icon that currently sits before "Public · Owner" or "Private · Owner." The new colored icon replaces it. The line itself stays, so it still reads "Public · Owner," "Private · Member," and so on.
> 5. The circle's name, the Public/Private · Owner/Member line, and the arrow on the right stay the same.
> 6. Archived circles: the colored icon fades along with the rest of the card, and archived cards stay at the bottom of the list as they do now.
> 7. This applies to every circle in the YOUR CIRCLES list, whether the user owns it or is a member.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screen:** Circles tab → YOUR CIRCLES cards.
2. **Navigation:** Circles tab with at least one Public and one Private circle (and one archived, if possible).
3. **What to verify:** Compare with `p03-circles-tab-colored-icons.png`. Light-green circle with dark-green globe (Public); light-purple circle with dark-purple lock (Private); about 46px, centered, about 12px gap; no small icon before "Public · Owner"; archived card fades, icon included.
4. **Code:** `MyCirclesScreen.tsx:30-45, 94-125` (`TYPE_ICON`, `CircleRow`: `h-11.5 w-11.5`, `gap-3`, `opacity-60` when archived), tokens `src/theme/tokens.cjs:154-157`.
5. **BEFORE (repo now):** As described, with the exact hex values as tokens.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] Public colors [ ] Private colors [ ] size, centering, gap [ ] no small inline icon [ ] name / line / arrow unchanged [ ] archived fades incl. icon [ ] rest of tab unchanged
10. **Files requiring changes:** None.

---

### R22 — Add an easier way to leave a circle

**Original PDF Page:** 17

**Original Revision Text:**

> ● Add an easier way to leave a circle
>
> Right now, members who didn't create a circle can only leave it by opening the Members tab and scrolling to the bottom of the list. That won't work well once circles have hundreds or thousands of members. Please:
>
> For members who aren't the owner, add a ••• button in the top right of the circle, in the same spot where owners see the Circle Settings gear icon.
>
> Tapping it opens a small menu with "Leave circle" in red.
>
> Before leaving, show a confirmation: "Leave [circle name]?" with "Leave" and "Cancel" buttons. For private circles, add: "You'll need a new invite to rejoin."
>
> Keep the "Leave circle" option at the bottom of the Members tab too.
>
> Members should still be able to leave a circle after it's been archived.
>
> Nothing changes for owners. They still see the gear icon and delete or archive the circle from Circle Settings.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screen:** Circle detail header (`CircleDetail`).
2. **Navigation:** As a **member** (not owner): Circles tab → tap a circle → ••• top right.
3. **What to verify:** ••• opens a small menu with red "Leave circle". Confirm: "Leave [name]?" plus, for Private, "You'll need a new invite to rejoin." with Leave and Cancel. "Leave circle" is still at the bottom of Members. Works in an archived circle. The owner sees the gear only.
4. **Code:** `CircleDetailScreen.tsx:84, 128-144, 345-381`, `leaveCircleQuestion` (`src/features/circles/postingLogic.ts:140-152`).
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Tests: `CircleDetailMemberMenu`, `CircleDetailArchivedLeave`, `CircleDetailMenuDismiss`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] ••• for members only [ ] red "Leave circle" [ ] confirm title exact [ ] Private extra line [ ] Public no extra line [ ] Members-tab option still there [ ] works when archived [ ] owner unchanged
11. **Files requiring changes:** None.

---

### R29 — Circle description updates

**Original PDF Page:** 29

**Original Revision Text:**

> ● Circle description updates
>
> 1. **150-character limit:** Add a 150-character limit to the circle description in both places it appears: the Create Circle screen and the Circle Settings screen. Show a counter right below the text box that updates as the user types (0/150, 45/150, and so on), styled the same way as the counter on the profile bio. Users can't type past 150 characters.
> 2. **Show the description inside public circles:** When someone opens a public circle, show its description directly under the circle name at the top of the screen. Use smaller, gray text, like the helper text elsewhere in the app. If the circle has no description, leave this space out completely, with no empty gap.
> 3. **Remove the invite code from the feed:** Remove the invite code box from the top of the circle's Feed tab. The invite code already shows when users tap the add-person icon in the top right corner, so that's where it will live from now on. Move the Feed and Members tabs up to fill the space.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screens:** Create a circle; Circle Settings (`EditCircle`); circle detail header and Feed.
2. **Navigation:** Circles → Create a circle → Public → Description. Owner: open circle → gear → Description. Any user: open a Public circle.
3. **What to verify:** Counter "0/150" updates live and typing stops at 150. The description shows under the name in small gray text, with no gap when empty. No invite-code box on the Feed; the add-person icon still shows the code.
4. **Code:** `CircleDescriptionField` (`src/features/circles/components/CircleDescriptionField.tsx`, `maxLength={CIRCLE_DESCRIPTION_MAX_LENGTH}`), `CreateCircleScreen`, `EditCircleScreen:173`, `CircleDetailScreen.tsx:79-80, 159-164`, `circleHeaderDescription` (`postingLogic.ts`); DB cap migration `20261021120500_circle_description_limit.sql`.
5. **BEFORE (repo now):** As described. Description fields exist for **Public** circles only (Private circles have no description field).
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The DB-side 150 cap is in a **step 3** migration, not yet live. The app limit works regardless.
8. **Code status:** **IMPLEMENTED** (server-side cap pending deploy).
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] counter on Create [ ] counter on Settings [ ] stops at 150 [ ] description under name in Public circle [ ] no gap when empty [ ] no invite box on Feed [ ] invite code via add-person icon [ ] tabs moved up
11. **Files requiring changes:** None in code. Deploy: `20261021120500` (step 3).

---

### R26 — Add archiving to Public Circles

**Original PDF Page:** 23–24

**Original Revision Text:**

> ● Add archiving to Public Circles
>
> Right now only Private Circles can be archived. Please add the same Archive option to Public Circles, in Circle Settings next to "Delete circle," for the circle's owner.
>
> When a Public Circle is archived:
> 1. People who already joined can still open it and read all the posts and replies.
> 2. No one can post or reply anymore.
> 3. It no longer shows up in Discover, and no one new can join.
> 4. Show a small label at the top of the circle: "This circle has been archived."
>
> **Unarchiving (Public and Private Circles):**
> 5. Owners should be able to unarchive both Public and Private Circles from Circle Settings. When a circle is archived, the "Archive circle" option should change to "Unarchive circle."
> 6. Unarchiving brings the circle back to normal: posting and replies work again, and a Public Circle shows up in Discover again.
>
> **Archived circles on the Circles tab (Public and Private Circles):**
> 7. In the "Your Circles" section, archived circles should show "Archived" at the end of the gray line under the circle name, for example "Private · Owner · Archived" or "Public · Member · Archived." This should show for everyone in the circle, not just the owner.
> 8. Slightly fade archived circle cards. As soon as a circle is archived, it should automatically move to the bottom of the user's list, below all their active circles. When it's unarchived, it moves back up with their active circles.
>
> **Notifications (Public and Private Circles):**
> 9. When a circle is archived, send a notification to every member except the owner: "[Circle name] has been archived. You can still read it, but no new posts can be added."
> 10. When a circle is unarchived, send a notification to every member except the owner: "[Circle name] is active again. You can post and reply again."
> 11. These should follow each member's notification setting for that circle (the bell icon). If they've turned notifications off for that circle, they don't get a push notification, but they still see it in the app's notifications list.

**Testing Phase:** IN-APP UI · **Category:** Circles (+ Notifications)

1. **Mobile screens:** Circle Settings (owner), circle detail, Discover, Circles tab, member's notifications (push / banner / bell list).
2. **Navigation:** Owner: Public circle → gear → **Archive circle** → confirm. Member (second phone): open the same circle; Discover; Journal tab → bell.
3. **What to verify:** Archive sits next to Delete; it then becomes "Unarchive circle". Members can read but not post or reply. The label "This circle has been archived." shows. The circle is gone from Discover and joining by code is refused. The line reads "… · Archived" for everyone, the card fades and moves to the bottom. Members get the archive / unarchive notification texts. A member with the bell off gets no push but sees it in the bell list.
4. **Code:** `EditCircleScreen.tsx:31-189` (`useArchiveCircle`, `useUnarchiveCircle`), `ArchivedCircleLabel`, `circleRoleLine` (`postingLogic.ts:104-112`), `MyCirclesScreen.archivedLast`; notification texts `supabase/functions/_shared/circleNotices.ts:17-21`; migration `20261022041000_circle_archiving.sql`; list `20261022130000_notifications_list.sql`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** Archive notices are saved to the list even for members who muted the circle. Tests: `EditCirclePublicArchiveOption`, `EditCircleUnarchive*`, `CircleFeedArchivedPublic`, `DiscoverJoinArchived`, `JoinByCodeArchived`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] Archive option for Public owner [ ] read-only for members [ ] no post or reply [ ] hidden from Discover, can't join [ ] label exact [ ] Unarchive option for Public + Private [ ] unarchive restores posting + Discover [ ] "· Archived" line for all [ ] faded + bottom, moves back up [ ] archive notification text exact [ ] unarchive notification text exact [ ] muted member: no push, in list
11. **Files requiring changes:** None.

---

### R10 — Fix nested replies in Private Circles

**Original PDF Page:** 6

**Original Revision Text:**

> ● Fix nested replies in Private Circles
>
> In Private Circles, replying to someone's reply doesn't work correctly. For example, I make a post, Auguste replies to it, and then I tap Reply on Auguste's message. My reply shows up as a reply to my original post instead of a reply to Auguste's message.
>
> Replies in Private Circles should work exactly the way they already do in Public Circles:
> 1. When a user taps Reply on someone's reply, the new reply should be attached to that specific reply, not to the main post.
> 2. It should show underneath the message it's replying to, the same way Public Circles display it.
> 3. Whoever's message was replied to should be clearly shown, the same way Public Circles show it.
>
> Since this already works in Public Circles, please use the same reply setup for Private Circles so the two behave the same.

**Testing Phase:** IN-APP UI · **Category:** Circles

1. **Mobile screen:** Private circle → post thread (`PostThread`).
2. **Navigation:** User A posts in a Private circle → User B replies → User A taps **Reply** on B's reply and sends.
3. **What to verify:** A's reply sits under B's reply (not under the post), with B shown as the person replied to, exactly like a Public circle.
4. **Code:** `PostThreadScreen`, `ThreadGroup`, `PostCard`, `CircleFeedScreen`; server depth rule in migration **`20261020100000_private_reply_depth.sql`** (`circle_posts_before_insert`).
5. **BEFORE (repo now):** The app sends the reply's parent correctly, but the **server trigger decides the depth**. Until the migration is live, the server still flattens Private replies to the post.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The migration is **step 3, not yet applied**. Deeper than reply → reply joins the same group tagged "@name", as Public does. Tests: `PostThreadPrivateNested`, `CircleFeedScreenPrivateNested`.
8. **Code status:** **IMPLEMENTED** (code + migration in repo). **Not live:** migration pending.
9. **Mobile Testing Status:** NOT TESTED (expect **FAIL / BLOCKED** until `20261020100000` is applied)
10. **Checklist (after step 3):** [ ] reply-to-reply attaches to the reply [ ] shows under it [ ] replied-to person shown [ ] same as Public
11. **Files requiring changes:** None in code. Deploy: `20261020100000_private_reply_depth.sql` (step 3).

---

### R9 — Verified badges for well-known users

**Original PDF Page:** 5

**Original Revision Text:**

> ● Verified badges for well-known users
>
> When celebrities and influencers join LYSM, people could pretend to be them by copying their name, profile picture, and bio, for example to run a fake Public Circle. To prevent this, add a verified badge that only we can give out.
>
> **1. Admin-only verified setting**
>
> Add a "verified" setting (on/off) to user accounts.
>
> Only admins can turn it on or off, for example directly in Supabase. There's no way for users to request it or turn it on themselves in the app.
>
> I'll handle verifying people manually outside the app. When someone is confirmed, I'll let you know or turn it on myself.
>
> **2. The verified badge**
>
> Verified users get a small purple check mark badge right after their name.
>
> It should show everywhere their name appears: posts, prompts, replies, member lists, in-app banners and notifications, and the header of circles they own.
>
> In Discover, Public Circles owned by a verified user should show the badge next to the owner's name.
>
> If the setting is turned off, the badge disappears everywhere right away.
>
> **3. Block fake check marks in names**
>
> Don't allow check mark characters or emojis in names, including ✓, ✔, ☑, ✅, and ☑️, so no one can fake the badge by typing it.
>
> If someone tries, show: "Names can't include check marks or verification symbols."
>
> This applies when creating an account and when editing a name in Edit Profile.

**Testing Phase:** IN-APP UI (point 3 also onboarding) · **Category:** Circles / Profile / Shared Components

1. **Mobile screens:** Profile header, circle posts, prompts and replies, Members tab, circle header (owner byline), Discover, in-app banners, bell list; Edit Profile; onboarding email sign-up.
2. **Navigation:** Supabase → Table Editor → `profiles` → set `verified = true` for account (g). On another account, view that person's post, reply, membership and owned circle, plus Discover. Edit Profile → Name → type "Taylor ✅" → Save. Onboarding → Save your progress → Continue with Email → Name "Taylor ✓".
3. **What to verify:** A small purple check appears after the name in every listed place. Set `verified = false`: it disappears on the next screen load. Check marks in a name show "Names can't include check marks or verification symbols." and block saving.
4. **Code:** `VerifiedBadge` (`src/components/VerifiedBadge.tsx`), used in `PostCard`, `CircleDetailScreen`, `CircleOwnerByline` (circle header + `PublicCircles` in Discover), `ProfileScreen`, `InAppBanner`, `NotificationsListScreen`; name rule `src/utils/nameSymbols.ts` (`NAME_CHECK_MARK_MESSAGE`, also catches look-alikes) via `src/features/auth/schema.ts` `signupSchema` and `EditProfileScreen.tsx:38`; migration `20261022060000_verified_badges.sql` (no UPDATE grant + trigger refusing app-user writes; `verified_circle_owners()` for Discover).
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** "Right away" means on the next data fetch, not pushed instantly. Most queries are fresh within 30 s or on screen open (`src/lib/queryClient.ts`; Discover owners `staleTime: 0`). **System push notifications (outside the app) are plain text and can't show a badge**; the in-app banner and list do. Names from Google / Apple are cleaned silently. The migration is deployed (step 1).
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] user can't set it in app [ ] badge on posts / prompts / replies [ ] Members list [ ] circle header of owned circle [ ] Discover owner byline [ ] in-app banner [ ] bell list [ ] Profile header [ ] turned off → gone on reload [ ] ✓ ✔ ☑ ✅ ☑️ refused at sign-up with exact message [ ] refused in Edit Profile
11. **Files requiring changes:** None.

---

### R13 — Make circles update in real time + in-app notifications

**Original PDF Page:** 7–9

**Original Revision Text:**

> ● Make circles update in real time + in-app notifications
>
> Right now, in both Public and Private Circles, new posts, prompts, and replies don't show up until the user leaves the circle and opens it again. Notifications already work. For example, if Auguste replies while I'm in the circle, I get a notification that he replied, but his reply doesn't appear on the screen until I leave and come back. If two people are talking in a Private Circle, they shouldn't have to keep leaving and coming back to see each other's replies.
>
> **Real-time updates in circles**
> 1. New posts, prompts, and replies from other members should appear on their own, without the user leaving the circle or pulling to refresh.
> 2. Likes, reply counts, edits, and deleted posts should also update live.
> 3. If the user is scrolled down reading older posts when something new comes in, don't jump them to the top. Instead, show a small "New posts" button at the top that takes them to the new content when tapped.
> 4. When the user opens a circle, or comes back to the app after it was in the background, it should load anything new right away.
> 5. This applies to both Public and Private Circles.
>
> **Notifications while the user is in the app (applies to every notification type)**
> 6. **No push notifications while the app is open:** never send an iOS or Android push notification while the user has the app open, no matter what it's for (circle activity, reflections, journaling reminders, streak reminders, archived circles, and anything else). Push notifications should only go out when the app is closed or in the background.
> 7. **In-app banners instead:** while the user is in the app, every notification should show as an in-app banner that slides down from the top of the screen, similar to Instagram.
>
>    Tapping the banner takes the user to whatever the notification is about.
>
>    The banner disappears on its own after about 4 seconds, or the user can swipe it up to dismiss it.
>
>    Banners follow the same notification settings as push notifications. If a notification type is turned off, no banner shows.
> 8. **No notifications on these screens:** don't show any banners while the user is in onboarding, on the paywall, on the sign-in or sign-up screens, or while the crisis resources pop-up is open. Anything that comes in during that time should still be saved to the in-app notifications list.
>
> **Circle activity banners**
> 9. **Top line:** "[Name] in [Circle name]" for a post, or "[Name] replied in [Circle name]" for a reply. **Second line:** a one-line preview of what they wrote. Tapping it opens the circle and goes straight to the post.
> 10. If several posts come in at once, combine them into one banner, like "Auguste and 2 others posted in Konah's Friends."
> 11. If the user is already viewing the circle where the activity happened, don't show a banner, since they'll see it appear live.
> 12. Banners follow each circle's notification setting (the bell icon). If notifications are off for that circle, no banner shows.
>
> **Weekly, monthly, and yearly reflection notifications**
>
> These already work this way. No changes needed, just making sure they stay as is:
> 13. Reflections become available at midnight on the day they're ready, but the notification goes out at 9 AM in the user's local time.
> 14. If the user already opened that reflection before 9 AM (for example, they were up at midnight and read it), don't send the 9 AM notification for it.
>
> New:
> 15. If the user is in the app at 9 AM (for example, writing a journal entry), show the reflection notification as an in-app banner instead of a push notification, following point 7. Tapping it opens that reflection on the Insights tab.
> 16. If more than one reflection is ready on the same day, send one notification for all of them, like "Your weekly and monthly reflections are ready." Tapping it opens the Insights tab.
>
> **Streak reminder**
> 17. If the user has an active streak and hasn't journaled yet that day, and they're in the app at 8 PM, show the streak reminder as an in-app banner instead of a push notification, following point 7. Tapping it takes them straight to the Journal tab.
>
> **Public Circle join notifications**
> 18. When someone joins a Public Circle, send a notification to the circle's owner: "[Name] joined [Circle name]." Tapping it opens the circle's Members tab.
> 19. If several people join close together, combine them into one notification, like "Auguste and 4 others joined Konah Public Circle."
> 20. This notification is on by default. The owner can turn it off in the circle's notification settings (the bell icon), with its own toggle, for example "New members."
> 21. It follows the same in-app rules as every other notification: in-app banner if the app is open, push notification if it's closed.

**Testing Phase:** IN-APP UI · **Category:** Circles + Notifications & Reminders (Shared Components: banner)

1. **Mobile screens:** Circle feed and post thread; the in-app banner (any main screen); Journal → bell → Notifications list; Circle → bell (`CircleNotifications`); Insights.
2. **Navigation:** Two phones, A and B, in the same circle. A opens the circle; B posts, replies, likes, edits and deletes. A scrolls down and B posts again. A goes to the Journal tab and B posts (banner). B posts 3 times quickly. A turns the circle bell off and B posts. A opens onboarding-type screens (n/a once onboarded) or the crisis sheet from New Entry, and B posts. Join test: B joins A's Public circle.
3. **What to verify:** Items 1–5: live arrival, live counts and edits, the "New posts" button when scrolled, refresh on open and on return from background. Item 6: no system banner or sound while the app is open. Items 7–12: a banner slides down, the tap navigates, it auto-hides at about 4 s, swipe up dismisses, combined text for multiple posts, no banner in the same circle, none when the circle bell is off, none while the crisis sheet is open (but it shows in the bell list). Items 15–17: 9 AM and 8 PM banners if in the app. Item 16: combined reflection text. Items 18–21: "[Name] joined [Circle]." opens Members; combined joins; "New members" toggle on by default.
4. **Code:** Live feed: `src/features/circles/circleLive.ts`, `liveApi.ts` (private topic), `liveFeed.ts`, `components/NewPostsButton.tsx`, `CircleFeedScreen.tsx:13-47, 146`, `PostThreadScreen`; migration `20261022030000_circle_posts_live.sql`. Banners: `src/features/notifications/push.ts:13-22` (`OPEN_APP_NOTIFICATION_BEHAVIOR`), `inAppModel.ts` (`BANNER_VISIBLE_MS = 4000`, texts at :368-390, blocked screens at :588-620), `components/InAppBanner.tsx`, `InAppBannerHost.tsx`, `bannerStore.ts`, `src/store/bannerHold.ts`, `openTarget.ts`. List: `NotificationsListScreen`, `NotificationBell`, `listApi.ts`, migration `20261022130000_notifications_list.sql`. Reflections: `supabase/functions/recap-notifications`, `_shared/recapPush.ts`. Streak: `supabase/functions/streak-reminder`. Joins: `supabase/functions/circle-join-digest`, `_shared/joinDigest.ts`, `_shared/circleNotices.ts:26-40`, `src/features/circles/notificationSwitches.ts:80` ("New members"), migration `20261022042000_circle_join_notifications.sql`.
5. **BEFORE (repo now):** All 21 items are built. **Item 6 is done on the phone:** the server still sends the push, and while the app is open the phone shows no system notification (no banner, list entry or sound) and LYSM shows its own banner instead. The user-visible result matches the PDF.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases / live blockers:** **Realtime Authorization (private channels)** must be enabled in the Supabase dashboard (still to do per `DEPLOY.md`). Without it, items 1–4 may not update live; CANNOT VERIFY from the repo. **The `circle-join-digest` cron isn't scheduled**, so item 19 (combining joins) won't work; only the first join in a quiet spell is announced. Daily check-in and trial reminders are scheduled on the phone, so they never reach the bell list (by design, noted in `verification-2026-10-21.md` §7).
8. **Code status:** **IMPLEMENTED** (all 21 items in code). Live: items 1–5 depend on a dashboard setting; item 19 depends on the cron job.
9. **Mobile Testing Status:** NOT TESTED (items 1–5 possibly **BLOCKED**; item 19 **BLOCKED** until cron)
10. **Checklist:** [ ] 1 new post / prompt / reply appears live [ ] 2 likes, counts, edits, deletes live [ ] 3 "New posts" button when scrolled [ ] 4 refresh on open + foreground [ ] 5 Public + Private [ ] 6 no system notification while open [ ] 7 banner slides, tap navigates, about 4 s, swipe up [ ] 7 type off → no banner [ ] 8 no banner on crisis sheet, saved to list [ ] 9 post / reply top line + preview, opens post [ ] 10 combined posts text [ ] 11 none in same circle [ ] 12 circle bell off → none [ ] 15 9 AM reflection banner → Insights [ ] 16 combined reflections text [ ] 17 8 PM streak banner → Journal [ ] 18 join text → Members [ ] 19 combined joins [ ] 20 "New members" toggle, on by default [ ] 21 banner if open / push if closed
11. **Files requiring changes:** None in code. Setup: enable Realtime Authorization; schedule `circle-join-digest` (SQL in the migration's comment).

---

### Profile & Account Settings

---

### R1 — Remove the email line from the Profile header

**Original PDF Page:** 1

**Original Revision Text:**

> ● Remove the email line shown under the user's name at the top of the Profile page. The header should only show the profile photo, name, and bio. Move the bio up to sit under the name so there's no empty gap where the email was, but leave comfortable spacing between them so it doesn't look cramped.

**Testing Phase:** IN-APP UI · **Category:** Profile & Account Settings

1. **Mobile screen:** Profile tab (`ProfileHome`).
2. **Navigation:** Profile tab (with a bio set in Edit Profile).
3. **What to verify:** Photo, name, bio only. No email. The bio sits right under the name with a small gap.
4. **Code:** `ProfileScreen.tsx:128-156` (bio `mt-2`).
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] no email line [ ] bio under name, no gap [ ] comfortable spacing [ ] no bio → nothing under the name
10. **Files requiring changes:** None.

---

### R24 — Move Reflection Tone out of Edit Profile and into its own row

**Original PDF Page:** 21

**Original Revision Text:**

> ● Move Reflection Tone out of Edit Profile and into its own row
>
> Remove the reflection tone setting from the Edit Profile screen. Edit Profile should only include name, photo, and bio. Its subtitle stays "Update your name, photo, and bio." On the Profile page, add a new row in the Account section, directly below Edit Profile, styled the same as the other rows (icon, title, subtitle, arrow):
>
> Title: Reflection Tone
>
> Subtitle: Choose how your AI reflections are written
>
> Tapping the row opens a Reflection Tone screen showing the same 4 tones from onboarding: gentle, direct, encouraging, and reflective. The rules are the same as onboarding: users must pick at least 1 and can pick up to 2. Their current selection should already be shown when the screen opens.

**Testing Phase:** IN-APP UI · **Category:** Profile & Account Settings

1. **Mobile screens:** Profile → Edit Profile; Profile → Reflection Tone.
2. **Navigation:** Profile tab → **Reflection Tone** (row right below Edit Profile).
3. **What to verify:** Edit Profile has name, photo and bio only. The row reads title "Reflection Tone" and subtitle "Choose how your AI reflections are written". The screen shows 4 tones with the current choice preselected. You can't deselect the last one or pick a 3rd.
4. **Code:** `ProfileScreen.tsx:72-81`, `ReflectionToneScreen` (`src/features/profile/screens/ReflectionToneScreen.tsx`, `MAX_TONES`, `toggleTone`), `EditProfileScreen.tsx:23-24`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] tone gone from Edit Profile [ ] Edit Profile subtitle unchanged [ ] new row position, title, subtitle [ ] 4 tones [ ] current choice preselected [ ] min 1 / max 2 [ ] saves
10. **Files requiring changes:** None.

---

### R31 — Remove the timezone setting and use the device's timezone automatically

**Original PDF Page:** 30

**Original Revision Text:**

> ● Remove the timezone setting and use the device's timezone automatically
>
> 1. Remove the Timezone field (and its "Use device" button and helper text) from the Edit Profile screen.
> 2. The app should automatically use whatever timezone the user's phone is set to. Check it every time the app opens or comes back from the background, and update it if it changed. For example, if a user on West Coast time flies to the East Coast, the app should switch to Eastern time once their phone does.
> 3. Streaks, the mood breakdown, and reflections should all use the user's current device timezone to decide what counts as "today."
> 4. Traveling should never break a streak on its own. An entry counts toward the day it was written, based on the local time on the user's phone at that moment.

**Testing Phase:** IN-APP UI · **Category:** Profile & Account Settings

1. **Mobile screen:** Profile → Edit Profile; behavior everywhere.
2. **Navigation:** Profile → Edit Profile. Then change the phone's time zone (Settings → General → Date & Time → turn off Set Automatically → pick another zone) → reopen the app.
3. **What to verify:** No Timezone field. After changing the zone, "today", the streak and Insights follow the new zone, and an entry counts toward the phone's local day.
4. **Code:** `useSyncProfileTimezone` (`src/features/profile/hooks.ts:43-80`), `src/features/profile/timezone.ts` (`phoneTimeZone`, `timezoneToSave`), `src/hooks/useLocalToday.ts`, `EditProfileScreen.tsx:23-24`; migration `20261022010000_travel_keeps_streak.sql`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The server's 8 PM streak reminder and 9 AM recap read the saved `profiles.timezone`, which is updated on open and on return from background. Test: `EditProfileNoTimezone.test.tsx`.
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] no Timezone field / button / helper [ ] zone change picked up on reopen [ ] "today" follows the phone [ ] streak not broken by a zone change
11. **Files requiring changes:** None.

---

### R18 — Send Feedback category pills

**Original PDF Page:** 12–13

**Original Revision Text:**

> ● On the Send Feedback screen, the category selector needs two changes: a wording change and a visual update. Reference image attached below.
>
> **Wording:** "Praise" is being replaced with "What's working" — it reuses language already in the subtext right above it ("Tell us what's working or what could be better") and is more accurately scoped to specific feedback on something that's landing well, rather than implying general enthusiasm for the app as a whole. Final set: Idea, Bug, What's working, Other.
>
> They stay as separate individual pills, not one connected track like the Week/Month/Year selector on Insights — this is specifically about how each pill looks, not about merging them into a single control.
>
> Selected pill: solid purple fill, white text — bold and unmistakable, not the current light purple tint with a thin border.
>
> Unselected pills: white background, no border, with a soft drop shadow underneath for depth. This replaces the current flat outline look, which reads as underweighted and unfinished sitting on the cream background.
>
> Everything else about this screen (layout, spacing, the message box below it) stays the same — this is just the pill styling itself.

**Testing Phase:** IN-APP UI · **Category:** Other In-App Features

1. **Mobile screen:** Profile → Send Feedback.
2. **Navigation:** Profile tab → **Send Feedback**.
3. **What to verify:** Separate pills: Idea, Bug, What's working, Other. Selected = solid purple with white bold text. Unselected = white, no border, soft shadow. Compare with `p12-send-feedback-pills.png`.
4. **Code:** `FeedbackScreen.tsx:44-66` (`bg-brand-600` selected, `shadow.pill` unselected), categories `src/features/help/data.ts:66-72`.
5. **BEFORE (repo now):** As described.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] 4 labels in order [ ] separate pills [ ] selected style [ ] unselected style [ ] rest of the screen unchanged
10. **Files requiring changes:** None.

---

### R25 — Help & FAQ Page Updates

**Original PDF Page:** 21–23

**Original Revision Text:**

> ● Help & FAQ Page Updates
>
> The design stays the same. Only the wording and the order change.
>
> **1. Remove these cards:**
>
> How do I get my trusted connections?
>
> Can I control what each person sees?
>
> **2. Replace all FAQ cards with the following, in this exact order:**
>
> **I'm in crisis. What should I do?**
> If you're in danger or thinking about harming yourself, please call 911 or call/text 988 (Suicide & Crisis Lifeline). LYSM also surfaces support resources when it detects concerning words as you write.
>
> **How do I log my mood?**
> Tap the + New Entry button on the Journal tab, choose how you feel, write anything on your mind, then tap Save Entry.
>
> **Can I edit or delete an entry?**
> Open an entry and tap the pencil to edit or the trash can to delete.
>
> **What are AI reflections?**
> After you save an entry, LYSM writes a short reflection on it in the tone you picked (gentle, direct, encouraging, or reflective). Open the entry to read it. Change your tone in Profile → Reflection Tone.
>
> **How do I leave a circle?**
> Open the circle and tap the three dots in the top right, then Leave circle. If you are the owner of the circle, you can archive or delete it in Circle Settings.
>
> **Who can see my journal?**
> Your entries are private by default. Only entries you explicitly share to a circle are visible. When you share, your mood is always included, and you choose whether to share your AI reflection or your written entry.
>
> **How do Circles work?**
> Private Circles are invite-only groups for people you trust, where anyone can post and share entries. Public Circles are open to anyone: someone posts a prompt and others respond. Create or join a circle from the Circles tab.
>
> **How do streaks work?**
> Your streak counts consecutive days with at least one entry. See the Insights tab.
>
> **How do I change or cancel my subscription?**
> Profile → Subscription opens your App Store or Google Play settings, where you can update or cancel anytime. Canceling during your free trial means you won't be charged.
>
> **How do I contact support?**
> Email support@lysm.app. If there's something you'd like us to know, you can also go to the Send Feedback page and share your thoughts there. We read everything.
>
> **How do I delete my account?**
> Go to Profile, scroll to the bottom, and tap Delete Account. This permanently deletes your account and all your entries.

**Testing Phase:** IN-APP UI · **Category:** Other In-App Features

1. **Mobile screen:** Profile → Help & FAQ.
2. **Navigation:** Profile tab → **Help & FAQ**.
3. **What to verify:** The 11 cards in the exact order and wording. The two removed cards are gone.
4. **Code:** `src/features/help/data.ts:10-55`, `HelpScreen`.
5. **BEFORE (repo now):** Exact text and order (`HelpScreenFaq.test.tsx`).
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] 2 cards removed [ ] 11 cards, exact order [ ] wording exact [ ] design unchanged
10. **Files requiring changes:** None.

---

### R23B — Email and password: full spec (Part B of 2: "Where the in-app changes live" + sections 2–5)

**Original PDF Page:** 17–21

**Original Revision Text:**

> **Where the in-app changes live:** a new row on the Profile page called "Sign-in & Security," placed near Subscription, with a short description under it like the other rows (for example, "Email and password"). Tapping it opens a screen with an "Email" row and a "Password" row. Nothing for changing email or password goes on the sign-in page. The sign-in page only has "Forgot password," for people who can't get in. Accounts created with only Google or Apple see "Set a password" instead of "Password" (see section 3).
>
> **2. Change email (inside the app, signed in only)**
>
> A confirmation code goes only to the new address, and the user types it into the app. The change doesn't take effect until it's confirmed. Nothing is required from the old address, because losing access to the old email is one of the main reasons people change it.
>
> After the change goes through, send a heads-up to the old address saying the email was changed. It requires no action and doesn't block anything. If someone ever swaps the email on an account that isn't theirs, the real owner at least finds out.
>
> If the new email already belongs to another LYSM account, block the change with a clear message. Never merge the two accounts.
>
> **Require the current password before an email change.** This keeps someone holding an unlocked phone from taking over the account. The one rare case it can't cover is a user who is signed in, forgot their password, and no longer has access to their old email. Send those users to support rather than weakening the check.
>
> **Google/Apple-only accounts:** email is read-only, since the provider controls it. The one exception is Apple relay addresses (section 5).
>
> **Linked sign-in must survive an email change.** Once Google or Apple is linked, the app should recognize that provider by its own account ID, not by the email text. Otherwise changing the email in LYSM quietly breaks Google or Apple sign-in.
>
> **3. Change password and Set a password (inside the app)**
>
> **Accounts with a password:** changing it requires the current password. The change screen also includes "Forgot your current password?", which sends the same reset email as the sign-in page's "Forgot password" so nobody hits a dead end.
>
> **After a password change, sign out the user's other devices.**
>
> **Accounts with no password (Google or Apple only):** the row says "Set a password." The user must re-authenticate through the provider the account was created with first, and then can create a password. This matches the "set a new password" rows in the account linking table.
>
> **4. Forgot password (sign-in page)**
>
> This stays the only way back in for someone who's locked out.
>
> **If the account is Google or Apple only,** don't send an email. Block the request on screen with a clear message instead, so the user isn't left waiting for an email that will never come: "This account uses Google sign-in, so there's no password to reset. Sign in with Google, or set a password under Sign-in & Security once you're in." Name the provider the account was actually created with (Google or Apple).
>
> **If no account exists,** no email is sent.
>
> **Password reset uses a code, not a link,** the same as email verification. The email contains a short code (for example, 6 digits) that the user types into the app before choosing a new password. Codes expire after a short window, work only once, and lock after a few wrong attempts (the user can then request a new one). Resetting a password signs out the user's other devices. **None of this is assumed to exist today, and all of it needs to be built:** code expiry, single use, the lockout after wrong attempts, and signing out other devices after a reset or a password change.
>
> **5. Apple "Hide My Email" (private relay) addresses**
>
> **Delivery:** emails sent to Apple relay addresses (they end in privaterelay.appleid.com) only arrive if LYSM's sending domain and From address are registered with Apple. Otherwise they bounce. This affects anything LYSM emails to a relay address, such as password resets for an Apple-created account that later sets a password. Register the sending domain with Apple and make sure the SPF record is set up correctly. This is not assumed to be set up today, and it needs to be done.
>
> **Sign-in with a relay address:** an Apple-only user who sets a password would have to sign in with email using a relay address they never see. **Let these users replace the relay address with their real email,** confirmed by a code sent to the new address, the same as section 2. This is the one exception to "email is read-only for Google/Apple accounts." It also fixes the matching problem in account linking, where a relay address never matches the real email Google returns.

**Testing Phase:** IN-APP UI · **Category:** Profile & Account Settings (+ Sign In → Forgot password)

1. **Mobile screens:** Profile → Sign-in & Security (`SignInSecurity`) → Email (`ChangeEmail`), Password (`ChangePassword`) or Set a password (`SetPassword`). Sign In → Continue with Email → Forgot password (`ForgotPassword`).
2. **Navigation:** Profile tab → **Sign-in & Security** (right below Subscription, subtitle "Email and password").
3. **What to verify:** Email + password account: Email row → current password → new email → code sent to the new address → changed; the old address gets a heads-up; an email already in use is blocked with a message; a "contact support" pointer is shown. Password → current password; "Forgot your current password?"; after the change, other phones are signed out. Google / Apple-only account: email read-only; the row says "Set a password" → provider re-auth → new password. Apple relay account: can replace the relay email with a real one by code. Forgot password: Google / Apple-only email shows the exact provider message and sends nothing; unknown email sends nothing; the reset is a 6-digit code (expires, works once, locks after wrong tries); reset signs out other devices.
4. **Code:** `ProfileScreen.tsx:102-106`; `src/features/security/screens/SignInSecurityScreen.tsx`, `ChangeEmailScreen.tsx`, `ChangePasswordScreen.tsx`, `SetPasswordScreen.tsx`, `src/features/security/messages.ts`; `src/features/auth/screens/ForgotPasswordScreen.tsx`, `codeMessages.ts:73`; server `change-email`, `update-password`, `password-reset`, `_shared/accountSecurity.ts` (codes, 60 s cooldown, expiry, lockout, `email_taken`, `revokeSessions`), `_shared/securityDeps.ts:224`; migration `20261022100000_sign_in_security_codes.sql`.
5. **BEFORE (repo now):** Sections 2–4 and the relay-replacement part of section 5 are built. After a password change or set, the server signs out **every** session, then this phone signs straight back in with the new password, so only the other devices end up signed out.
6. **AFTER (required):** As the PDF describes, including registering the sending domain with Apple plus SPF.
7. **Logic & edge cases:** Provider sign-in is matched by provider account ID, not by email text (Supabase identities). **Apple private relay domain + SPF registration is outside the code and not done** (`DEPLOY.md`), so emails to relay addresses may bounce.
8. **Code status:** **PARTIALLY IMPLEMENTED.** All code is built; the PDF's explicit "register the sending domain with Apple … SPF" step (section 5, Delivery) is **not done**.
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] row position + subtitle [ ] Email and Password rows [ ] change email: password required, code to new address, heads-up to old [ ] email in use blocked [ ] Google / Apple: email read-only, "Set a password" after re-auth [ ] change password: current required, "Forgot your current password?" [ ] other device signed out after change [ ] forgot password: provider-only message exact, no email [ ] unknown email: no email [ ] reset by code; wrong code locks; code single-use [ ] reset signs out other devices [ ] Apple relay → replace with real email by code [ ] email to a relay address arrives (after Apple registration)
11. **Files requiring changes:** None in code. Setup (outside code): register the sending domain and From address in Apple Developer → Sign in with Apple for Email Communication, plus SPF.

---

### Notifications & Reminders

---

### R2 — Streak Reminder description on the Notifications screen

**Original PDF Page:** 1

**Original Revision Text:**

> ● On the Notifications screen, change the Streak Reminder's description from "A heads-up at 8 PM if your streak is about to end" to: "A heads-up if your streak is about to end" The reminder itself still goes out at 8 PM. Only the description text changes.

**Testing Phase:** IN-APP UI · **Category:** Notifications & Reminders

1. **Mobile screen:** Profile → Notifications.
2. **Navigation:** Profile tab → **Notifications**.
3. **What to verify:** The Streak Reminder description reads "A heads-up if your streak is about to end". The reminder still arrives at 8 PM.
4. **Code:** `NotificationsScreen.tsx:60`.
5. **BEFORE (repo now):** Exact text.
6. **AFTER (required):** As the PDF describes.
7. **Code status:** **IMPLEMENTED.**
8. **Mobile Testing Status:** NOT TESTED
9. **Checklist:** [ ] text exact [ ] 8 PM timing unchanged
10. **Files requiring changes:** None.

---

### R28 — Streak milestones in the daily reminder and the streak reminder

**Original PDF Page:** 27–29

**Original Revision Text:**

> ● Streak milestones in the daily reminder and the streak reminder
>
> The timing and on/off settings for both notifications stay exactly as they are now. Only the wording changes, based on the user's streak.
>
> For everything below:
>
> [X] is the user's current streak, counting through yesterday.
>
> [X+1] is what their streak becomes if they journal today.
>
> Milestone days are the same ones from the streak popup spec: 3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 500, and 1,000, plus every yearly anniversary (730, 1,095, and so on) and every 100 days after 365 (400, 600, 700, and so on).
>
> **1. Daily journaling reminder**
>
> Regular days: no change. Keep using the 7-prompt rotation, exactly how it works now.
>
> Milestone days: if the user hasn't journaled yet today and [X+1] is a milestone, replace that day's rotating prompt in the notification with:
>
> Today could be day [X+1]. Take a minute to check in.
>
> For example: "Today could be day 30. Take a minute to check in."
>
> If the user has already journaled today by the time the reminder goes out, use the normal rotating prompt instead.
>
> The home page subtitle (under "Good evening, [name]") always shows the regular rotating prompt, even on milestone days. Only the notification changes.
>
> Milestone days don't affect the rotation. The next day continues the rotation as normal.
>
> **2. Streak reminder (8 PM)**
>
> This still only sends at 8 PM when the user has an active streak and hasn't journaled yet that day. Use the first message below that applies:
>
> 1. If [X+1] is a milestone:
>
>    Don't lose your [X] day streak. Check in before midnight to reach day [X+1].
>
> 2. If [X+1] would beat the user's longest streak:
>
>    Check in before midnight to achieve your longest streak.
>
>    Never use this during a user's first-ever streak.
> 3. Otherwise: no change. Keep using the current streak reminder messages, exactly how they work now.
>
> **3. Formatting**
>
> Replace [X] and [X+1] with the actual numbers.
>
> Use commas in numbers 1,000 and higher.
>
> Both notifications use the user's current device timezone to decide what "today" and "midnight" mean.

**Testing Phase:** IN-APP UI · **Category:** Notifications & Reminders

1. **Mobile screens:** System notifications (app closed) or in-app banner (app open); Journal home subtitle.
2. **Navigation:** An account with a 2-day streak (tomorrow = day 3) and notifications on. Wait for the daily reminder time (Profile → Notifications) without journaling; then 8 PM.
3. **What to verify:** Daily reminder: "Today could be day 3. Take a minute to check in." Journal before the reminder time and the normal rotating prompt comes instead. The home subtitle always shows the rotating prompt. 8 PM: "Don't lose your 2 day streak. Check in before midnight to reach day 3." On the day before beating your longest streak (not your first streak): "Check in before midnight to achieve your longest streak."
4. **Code:** Daily: `src/features/journal/streakMessages.ts:117`, `src/features/journal/hooks.ts:133` (reschedules the phone's reminder), `src/features/notifications/reminders.ts`. 8 PM: `supabase/functions/_shared/streakReminder.ts` (`streakReminderMessage`, `isStreakMilestone`, `formatCount`), `supabase/functions/streak-reminder/index.ts`; migration `20261022020000_streak_milestones.sql`.
5. **BEFORE (repo now):** As described. The edge-function copy is checked against the app's milestone list by a test (every day up to 20,000).
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** The "longest streak" line shows only on the day [X+1] would first beat the previous longest (same rule as the popup; owner decision in `verification-2026-10-21.md` §4.4). The 8 PM push only goes out when the app is closed; otherwise a banner (R13 item 17).
8. **Code status:** **IMPLEMENTED.**
9. **Mobile Testing Status:** NOT TESTED
10. **Checklist:** [ ] milestone daily text exact [ ] already journaled → normal prompt [ ] home subtitle unchanged [ ] next day rotation continues [ ] 8 PM milestone text exact [ ] 8 PM longest-streak text (not first streak) [ ] otherwise old message
11. **Files requiring changes:** None.

---

### Subscription Management

---

### R34C — Paywall spec (Part C of 3: section 9 "Returning-user paywall ('Welcome back')")

**Original PDF Page:** 37–38

**Original Revision Text:**

> **9. Returning-user paywall ("Welcome back")**
>
> It uses the same layout as the main paywall, with these differences:
>
> No progress bar.
>
> **Header:** "[First name], welcome back"
>
> **Purple card:** label "YOUR LAST ENTRY · [DATE]" with the sparkle icon. The first line of the user's most recent journal entry is fully readable, the rest is blurred, and the white pill says "Subscribe to open your journal." Use the most recent entry that wasn't flagged by the concerning-words check. If they have no entries, hide the card.
>
> **Three checkmark lines:**
>
> All [number] of your entries, right where you left them
>
> New reflections in the tone you chose
>
> Your circles and the people in them
>
> **"CHOOSE YOUR PLAN" label** between the checkmark lines and the plan cards, in the same gray, spaced-out caps style as the app's other section labels (like "TODAY'S MOOD"), with a bit of extra space above it.
>
> **Plan cards:** same as the main paywall, but "Billed yearly" and "Billed monthly" replace the trial lines.
>
> **No trial timeline.**
>
> **Button:** "Start annual plan" with "Cancel anytime." under it (or "Start monthly plan" when Monthly is selected), then "Restore purchases · Terms · Privacy."
>
> If the user is somehow still eligible for the free trial (per section 8), show the trial version of the button, card text, and timeline instead.
>
> **When it shows:**
>
> **Subscription ended, app still installed:** every time the user opens the app without an active subscription, take them straight to the Welcome back paywall. If they cancel, they keep full access until the end of the period they already paid for, and the paywall should only show once that period actually ends.
>
> **App deleted and reinstalled:** treat them as a brand-new user, starting at the beginning of onboarding. If they tap "Sign in" instead and sign in successfully:
>
> **No active subscription:** take them straight to the Welcome back paywall, then into the app once they subscribe.
>
> **Active subscription:** skip the paywall completely and take them straight into the app.
>
> **Check the subscription status every time the app opens,** so this always reflects their current status with the App Store or Google Play.

**Testing Phase:** IN-APP UI · **Category:** Subscription Management

1. **Mobile screen:** "Welcome back" paywall (`PaywallScreen`, root gate stage `paywall`).
2. **Navigation:** An account whose trial or subscription has ended (e.g. the app's own trial expired, or set it expired in Supabase) → open the app. Or reinstall → Welcome → **Sign In** with that account.
3. **What to verify:** No progress bar. "[First name], welcome back". Card "YOUR LAST ENTRY · [DATE]" with ✨, first line readable and the rest blurred, pill "Subscribe to open your journal."; hidden with no entries. Three lines. "CHOOSE YOUR PLAN" label. Cards "Billed yearly" / "Billed monthly". No timeline. "Start annual plan" / "Cancel anytime." (Monthly → "Start monthly plan"). "Restore purchases · Terms · Privacy". An active subscriber who signs in goes straight to Home. Compare with `p37-paywall-welcome-back.png`.
4. **Code:** `PaywallScreen` (`src/features/subscription/screens/PaywallScreen.tsx`), `LastEntryCard`, `lastEntry.ts`, `paywallCopy.ts` (`welcomeBackHeader`, `lastEntryLabel`, `PILL_SUBSCRIBE`, `welcomeBackBenefits`, `CHOOSE_YOUR_PLAN`, `planSubline('billing')`), gate `src/navigation/gate.ts` (`entitled`), `useEntitlement`, `src/features/iap/` (store re-check on open), `validate-purchase`.
5. **BEFORE (repo now):** Built as described, with **documented deviations** (owner decisions in `verification-2026-10-21.md` §4.4): (1) a **"Log out"** link is kept under the footer (not in the PDF or mockup); (2) the first checkmark line reads "Your 1 entry, right where you left it" for 1 entry and "Your journal, right where you left it" for 0 (the PDF only gives "All [number] of your entries…").
6. **AFTER (required):** As the PDF describes.
7. **Logic & edge cases:** A cancelled plan keeps access until its paid period ends. The subscription is re-checked with the store on every open, but **store products aren't set up**, so on build 12 entitlement comes from the app's own trial only, and "Start annual / monthly plan" shows "Purchases aren't available right now". You can't complete a purchase from this screen yet.
8. **Code status:** **IMPLEMENTED** (with the 2 owner-approved deviations above). Purchasing is **not testable live** until store setup.
9. **Mobile Testing Status:** NOT TESTED (purchase **BLOCKED** until store products exist)
10. **Checklist:** [ ] shown at open when lapsed [ ] no progress bar [ ] header [ ] last-entry card + label + blur + pill [ ] flagged entries skipped; card hidden with 0 entries [ ] 3 lines [ ] "CHOOSE YOUR PLAN" style + spacing [ ] Billed yearly / monthly [ ] no timeline [ ] button + note per plan [ ] links [ ] active subscriber sign-in skips paywall [ ] note "Log out" link present (deviation)
11. **Files requiring changes:** None in code (unless you want the "Log out" link or the 0/1-entry wording reverted to the PDF). Setup: store products + IAP secrets.

---

### In-app completion summary

| | Count |
|---|---|
| In-app revision entries | **27** (R6, R11, R20, R34B, R27, R3, R7, R19, R30, R14, R4, R5, R22, R29, R26, R10, R9, R13, R1, R24, R31, R18, R25, R23B, R2, R28, R34C) |
| Implemented (code) | **26** |
| Partially implemented | **1**: R23B (Apple private-relay sending domain + SPF registration not done; outside the code) |
| Not implemented | 0 |
| Cannot verify | 0 in code. Live behavior CANNOT be verified from the repo for R13 items 1–5 (Realtime Authorization dashboard setting). |
| Expected to fail on build 12 until deploy step 3 | **R10, R19** (and the server-side cap of R29) |
| Blocked by backend setup | R13 item 19 (cron), R34C purchase, parts of R21 and R34A (Phase 1) |
| Mobile testing pending | **27 of 27** |

---

## Whole-document summary

| | Onboarding | In-app | Total |
|---|---|---|---|
| Entries (34 PDF revisions; R23 split in 2, R34 split in 3) | 10 | 27 | **37** |
| Implemented | 10 | 26 | 36 |
| Partially implemented | 0 | 1 | 1 |
| Not implemented | 0 | 0 | 0 |
| Cannot verify (code) | 0 | 0 | 0 |
| Mobile: NOT TESTED | 10 | 27 | 37 |

**Before testing R10 and R19, ask for deploy step 3** (the three migrations listed at the top). Otherwise both will fail on build 12 even though the code is done.

Send me results as `R# — PASSED / FAILED / BLOCKED` (with a note or screenshot for failures) and I'll update the Mobile Testing Status lines.
