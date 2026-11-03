# InnerCircle — Backend Deploy Runbook

> **Release in progress: client revisions 10/14 (October 2026).** Each step needs the owner's
> explicit go-ahead.
>
> **Deployed 2026-10-23 (with iOS build 12):** steps 1 and 2 below, i.e. all 15 migrations except
> the three in step 3, applied in one transaction via the Management API (rehearsed rolled back on
> live data first; all 13 checks in `supabase/tests/` pass on production, 300 ok / 0 bad), and all
> 18 Edge Functions listed below. **Still to do:** step 3 (after testers have build 12), the
> circle-join-digest cron job, the new secrets, the Realtime and Auth settings, store products. The full status is in
> `design_and_spec/revisions-2026-10-14/verification-2026-10-21.md`. **Do not use `npx supabase db
> push` on this project**: its migration history table is unreliable. Apply each migration file
> through the Management API (as was done for the 2026-09-30 release), then run its check in
> `supabase/tests/<name>.test.sql`. The check always rolls back and must end with `bad=0`.
>
> **Order (from each migration's own notes; review each header again before applying):**
> 1. Before the new app build ships: `20261022060000_verified_badges` (the build reads
>    `profiles.verified`). `20261022080000_welcome_reflection` goes with or before the
>    welcome-reflection function. Then every 20261022* migration the build calls, plus
>    `20261021150500_reflection_periods_month_end` (independent). Notes say these leave older builds
>    working: circles_activity_order, circle_archiving, circle_join_notifications,
>    notifications_list, store_purchases.
> 2. Together with the build: `20261016100000_display_name_from_provider`.
> 3. Only after testers have installed the new build (older builds would misbehave):
>    `20261020100000_private_reply_depth`, `20261020110000_insights_empty_periods`,
>    `20261021120500_circle_description_limit`.
>
> **New / changed Edge Functions:** account-link, ai-summary, change-email, circle-join-digest,
> confirm-email-verification, delete-account, detect-crisis, detect-private-threat,
> generate-reflections, moderate-circle-content, password-reset, recap-notifications,
> request-email-verification, send-push, streak-reminder, update-password, validate-purchase,
> welcome-reflection.
>
> **New secrets:** `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_ID` (optional); the Apple revoke key
> (see delete-account); for in-app purchases `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`,
> `APPLE_IAP_PRIVATE_KEY` (App Store Connect → Users and Access → Integrations → In-App Purchase
> key, .p8), `GOOGLE_PLAY_SERVICE_ACCOUNT` (service-account JSON with access to the app in Play
> Console → Users and permissions), and optionally `APPLE_BUNDLE_ID` / `ANDROID_PACKAGE_NAME`
> (default `com.lysm.app`). Rotate `CRON_SECRET` (it appeared in tool output on 2026-10-20).
>
> **Scheduled jobs:** circle-join-digest every minute (SQL in the comment of
> `20261022042000_circle_join_notifications`, needs `CRON_SECRET`). The notifications-list and
> auth-code clean-ups schedule themselves.
>
> **Supabase settings:** Realtime → enable private channels / Realtime Authorization (live circles
> use private topics). Auth email templates send 6-digit codes (Sign-in & Security).
>
> **In-app purchases (store setup by the account owner; product ids are fixed in
> `src/features/iap/products.ts`):**
> - App Store Connect: Paid Apps agreement signed. One subscription group "LYSM Premium" with
>   `lysm.premium.annual` (1 year; introductory offer: free, 5 days, new subscribers) and
>   `lysm.premium.monthly` (1 month, no trial). Prices: $29.99 / $4.99 (US), the store localizes
>   them. Optional: App Store Server Notifications are not required (the app re-checks on open).
> - Google Play Console: subscriptions `lysm.premium.annual` (base plan `annual`, 1 year,
>   auto-renewing; offer `free-trial`: 5 days free, eligibility "new customer acquisition") and
>   `lysm.premium.monthly` (base plan `monthly`, 1 month). Same prices.
> - Until both products exist, the app automatically keeps its own 5-day trial (nobody is stuck),
>   and the paid plans say purchases aren't available right now.
> - Apple: register the email sending domain + From address for Hide My Email relays, with SPF.

Everything the **app build** can't include lives here: the database schema, the Edge
Functions, and the Supabase Auth configuration. Do these once to make the current build
fully work (onboarding, first-person AI insight, monthly reflection date, first-name greeting).

Run all commands from the project root. Windows: use Git Bash.

---

## 0. Prerequisites (one time)

- Supabase CLI (already available via `npx supabase`).
- `.env` already contains `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`.
- You'll need to supply three secret **values** yourself (not in the repo):
  - `AI_API_KEY` — an OpenAI **or** OpenRouter API key (powers the AI insight + reflections).
  - `RESEND_FROM` — the verified "from" address for emails, e.g. `InnerCircle <noreply@yourdomain.com>`.
  - `EXPO_ACCESS_TOKEN` — an Expo token for sending push (you can reuse the one in `.env`).

Load the token + link the project:

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
export REF=$(grep '^SUPABASE_PROJECT_REF=' .env | cut -d= -f2-)
npx supabase link --project-ref "$REF"
```

---

## 1. Database migrations

**Never run `npx supabase db push` (or `migration list`) against production.** Earlier
migrations were applied as direct SQL, so `supabase_migrations.schema_migrations` doesn't list
everything that is live, and `db push` would try to re-apply live objects. Apply each pending
migration file through the Management API instead, in the order given at the top of this file.

1. **Read the migration's header** (deploy order, what older builds need).
2. **Rehearse on live data, rolled back:** send the migration file followed by its check
   `supabase/tests/<name>.test.sql` in ONE request. A multi-statement request runs as one
   transaction, and the check always ends with `RAISE EXCEPTION`, so nothing is kept. The
   answer must be the error `ROLLED BACK. ok=<n> bad=0`.
3. **Apply:** send the migration file on its own (several files can go in one request, all or
   nothing), then record it:
   `insert into supabase_migrations.schema_migrations (version, name) values ('<version>', '<name>');`
4. **Verify:** run the check again on its own: it must still end with `bad=0`.

Sending a file (or several, joined in order):

```bash
cat supabase/migrations/<version>_<name>.sql supabase/tests/<name>.test.sql \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify({query:s})))' \
  | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
      --data @-
```

(Drop the test file from `cat` to apply, or the migration file to verify.) Not every migration
has a check in `supabase/tests/`; for one that doesn't, verify the objects it creates directly.

---

## 2. Edge Function secrets

Set the runtime secrets the functions need. (Do **not** set `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` — Supabase injects those automatically.)

```bash
npx supabase secrets set \
  AI_API_KEY="<your-openai-or-openrouter-key>" \
  AI_BASE_URL="https://openrouter.ai/api/v1" \
  AI_MODEL="openai/gpt-4o-mini" \
  RESEND_API_KEY="$(grep '^RESEND_API_KEY=' .env | cut -d= -f2-)" \
  RESEND_FROM="InnerCircle <noreply@yourdomain.com>" \
  EXPO_ACCESS_TOKEN="$(grep '^EXPO_TOKEN=' .env | cut -d= -f2-)"
```

Verify: `npx supabase secrets list` shows all six names.

Native Google sign-in (once its OAuth client ids exist, see `.env.example`): also set
`GOOGLE_OAUTH_CLIENT_IDS="<web client id>,<iOS client id>"`. account-link
(the account linking pre-check) and Sign-in & Security only accept Google id tokens issued to
these ids; until it is set, native Google sign-in is refused with a clear message (the browser
fallback is unaffected). `APPLE_CLIENT_ID` is optional (default `com.lysm.app`).

---

## 3. Deploy the Edge Functions

```bash
npx supabase functions deploy ai-summary                  # first-person AI insight
npx supabase functions deploy generate-reflections        # weekly/monthly/yearly reflections
npx supabase functions deploy request-email-verification   # 6-digit email codes (Sign-in & Security)
npx supabase functions deploy confirm-email-verification
npx supabase functions deploy change-email
npx supabase functions deploy update-password
npx supabase functions deploy password-reset
npx supabase functions deploy account-link                 # account linking pre-check (needs migration 20261022110000)
npx supabase functions deploy send-invite
npx supabase functions deploy send-push
```

(Or deploy all at once: `npx supabase functions deploy`.)

---

## 4. Supabase Auth configuration (Dashboard — cannot be done via CLI)

**Required for onboarding to run at all** (it starts on an anonymous session and links to a
real account at sign-up).

In the Supabase Dashboard → **Authentication**:
- **Sign In / Providers → Anonymous sign-ins → ENABLE.**
- **Manual linking → ENABLE** (anonymous → real account upgrade).
- **Providers → Apple → enable** (Services ID + key from the Apple Developer console).
- **Providers → Google → enable** (Web + iOS client IDs). For iOS native, turn on **"Skip nonce check"**.
- **URL Configuration →** add the app's deep-link redirect URLs for password reset + email
  confirmation: `innercircle://reset-password`, `innercircle://auth-callback` (and the
  `innercircle-dev://` / `innercircle-staging://` variants if you build those).

Email + Google/Apple provider credentials come from Resend / Apple Developer / Google Cloud
consoles respectively.

---

## 5. Verify end-to-end (on the installed APK)

1. **Fully uninstall + reinstall** the app, tap **Get Started** (fresh onboarding).
2. Onboarding runs → confirms anonymous sign-in works.
3. Sign up with email → confirm-email page appears **before** payment → after payment, the
   "You're all set" screen.
4. First check-in → the AI insight reads in **first person** ("I …").
5. Home greets by **first name**.
6. Insights → **monthly** reflection unlock date = first entry **+ 1 month** (e.g. Jul 7 → Aug 7).

---

### Notes
- Function deploys are safe to re-run. Migrations are not all safe to re-run: check
  `schema_migrations` and the live objects before applying one again.
- Rolling back a migration is manual (write a down-migration). Rehearse every migration
  rolled back (section 1) before applying it to production.
- After deploy, no app rebuild is needed — the functions + DB serve the existing build.
