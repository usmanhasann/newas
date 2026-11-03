# Edge Functions

Privileged, server-only logic (build prompt §4/§6). Secrets are set via
`supabase secrets set` and are **never** bundled into the app.

## ai-summary

Generates a warm insight for a journal entry. OpenAI-compatible, so it works with
OpenRouter (routing to an OpenAI model) or OpenAI directly.

Required secrets:

```bash
supabase secrets set AI_API_KEY=sk-...           # OpenRouter or OpenAI key
supabase secrets set AI_BASE_URL=https://openrouter.ai/api/v1   # or https://api.openai.com/v1
supabase secrets set AI_MODEL=openai/gpt-4o-mini # any OpenAI-compatible model id
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the Edge runtime.

Deploy:

```bash
supabase functions deploy ai-summary
```

Behavior: validates the caller owns the entry, rate-limits to 5 summaries/user/min,
is idempotent (skips if already summarized), and persists `ai_summary` + `ai_status`
(`pending` → `ready`/`failed`).

## send-invite

Emails a circle invite (with the join code) via Resend, and records it in
`circle_email_invites`. Validates the caller owns the circle; rate-limited to 20/hour.

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM="InnerCircle <hi@yourdomain.com>"
supabase functions deploy send-invite
```

The recipient joins by entering the code on “Circles → Discover circles” (or at
signup, which redeems it automatically).

## generate-reflections

Generates Weekly/Monthly/Yearly AI reflections for **completed** periods (build task
§7). Uses the same AI secrets as `ai-summary` (`AI_API_KEY` / `AI_BASE_URL` /
`AI_MODEL`).

```bash
supabase functions deploy generate-reflections
```

Behavior:

- **Period math is server-side** — it calls the SQL period service
  (`get_due_reflection_periods`), so the client never computes periods (§8).
- **Idempotent + static** — a period is generated once; a `ready` reflection is never
  overwritten (the `reflections(user_id, type, period_start)` unique constraint +
  `WHERE status <> 'ready'` guards guarantee it won't regenerate on revisit, restart,
  new entries, or a model/prompt change). Safe to call on every Insights open.
- **Two callers**: the app (user JWT, on opening Insights) and an optional scheduled
  job (service-role key as the bearer + `{ "user_id": "…" }` in the body).
- Handles no-content / little-content gracefully, never invents activity, and records
  `model`, `prompt_version`, `source_version`, and `source_entry_ids` per reflection.

### Optional: scheduled generation (don't depend on the app being open)

On-open generation already catches up any due periods the next time a user opens
Insights. To generate proactively without the app open, schedule a daily job. This
needs the `pg_cron` + `pg_net` extensions (enable them in the Supabase dashboard) and
is therefore **not** an auto-run migration — run it once in the SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- daily at 02:00 UTC: generate due reflections for every user who has a
-- completed-but-ungenerated period. Use the SERVICE ROLE key (store via Vault).
select cron.schedule('generate-reflections-daily', '0 2 * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/generate-reflections',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object('user_id', p.user_id)
  )
  from public.profiles p
  where exists (
    select 1 from public.get_due_reflection_periods(
      (now() at time zone coalesce(p.timezone, 'UTC'))::date, p.user_id
    )
  );
$$);
```

## send-push (Phase 4)

Fans out notifications for circle events — replies, new prompts / posts, reactions,
new shared entries, join requests and approved requests. Resolves recipients
server-side, checks every event against the database, and honors each person's own
switches for that circle (`circle_notification_prefs`; no row = all ON). Reactions
notify on each person's first reaction only; "join request approved" has no switch.
A shared journal entry is a post in its circle (`circle_posts.entry_id`); it's announced
once per circle by `share_created`, only once members can see it, never as a new post.
Delivery uses **Expo's push service**
(the client registers an Expo push token), which relays to FCM (Android) + APNs
(iOS) — so there are **no FCM/APNs keys on the server**.

```bash
# No secrets required by default.
supabase functions deploy send-push

# OPTIONAL: only if you enable Expo "enhanced security for push" in your Expo account
supabase secrets set EXPO_ACCESS_TOKEN=...
```

Credentials live in EAS, not here:

- **Android:** create a Firebase project, add `google-services.json` to the build
  (`android.googleServicesFile` in `app.config.ts`), and upload the FCM v1 service
  account to EAS via `eas credentials`. (FCM is required for any Android push.)
- **iOS:** APNs is managed automatically by EAS during the build — nothing to set.

Tokens Expo reports as `DeviceNotRegistered` are auto-disabled in `device_tokens`.

## recap-notifications

The "your Weekly / Monthly / Yearly Recap is ready" push, sent at **9 AM local on the
day a recap card unlocks** (the day after its period ends), once per period, only
for a period with at least one entry and only while that recap's switch is on.
`claim_recap_pushes()` (SQL) decides who and when; the function asks
`generate-reflections` to write the new recap first so it's ready on tap.

Scheduled like `streak-reminder`: `verify_jwt = false` (config.toml), authorized by the
shared `CRON_SECRET`, run every 30 minutes by pg_cron + pg_net:

```sql
select cron.schedule('lysm-recap-notifications', '0,30 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/recap-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
$$);
```

## Payments — in-app purchases (App Store / Google Play)

Billing uses native in-app purchases (expo-iap, see `src/features/iap`). Stripe has been
removed from the code.

## validate-purchase

Checks every App Store / Google Play purchase with Apple (App Store Server API) or Google
(Play Developer API) before it grants anything, then writes the entitlement through the
`apply_store_subscription(...)` RPC (migration `20261022140000_store_purchases`). The app
also asks it to re-check the account's store subscription every time it opens. One store
subscription unlocks one LYSM account. The logic lives in `_shared/storePurchase.ts`
(Jest-tested). Signed-in user's JWT required (default `verify_jwt = true`).

```bash
# Apple: the In-App Purchase key (.p8) from App Store Connect → Users and Access → Integrations
supabase secrets set APPLE_IAP_ISSUER_ID=... APPLE_IAP_KEY_ID=... APPLE_IAP_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
# Google: the service-account JSON (plain JSON, not base64) with access to the app in Play Console
supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT="$(cat play-service-account.json)"
# Optional, both default to com.lysm.app
supabase secrets set APPLE_BUNDLE_ID=com.lysm.app ANDROID_PACKAGE_NAME=com.lysm.app
supabase functions deploy validate-purchase
```

A store whose secrets are missing answers `not_configured`. Until both store products exist,
the app keeps its own **5-day trial** (`start_trial` RPC), so nobody is stuck. The client
never writes entitlement; the `subscriptions` table is written only by the service role.
Subscription environment (`development` / `production`) maps to the store sandbox vs.
production environment. Store product setup: DEPLOY.md, "In-app purchases".
