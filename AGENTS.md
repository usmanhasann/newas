# Project conventions (InnerCircle)

Read `README.md` for setup/architecture and `design_and_spec/` for the client design +
master specs. Expo SDK 56 changed some APIs — when touching native config or new
modules, check https://docs.expo.dev/versions/v56.0.0/.

## Rules

- **TypeScript strict.** No `any` without a justified comment.
- **Token-driven styling only.** Every color/font/spacing/radius comes from
  `src/theme/tokens.cjs` (via NativeWind classes or the typed theme). Never hard-code
  visual values. The design spec is the source of truth for appearance; this repo's
  behavior specs live in the build prompt.
- **Feature isolation.** Features (`src/features/*`) import each other ONLY through a
  feature's public `index.ts`. All DB access goes through a feature's `api.ts`.
- **Security.** Client uses the Supabase anon key only; RLS enforces access. Privileged
  work (LLM, email, store receipt validation, push, fan-out) runs in Edge Functions with the service
  role. No service-role key or third-party secret ever reaches the bundle.
- **Scale by default.** Paginate lists (keyset), index filter/sort columns, do fan-out
  async, rate-limit Edge Functions, make webhooks/sends idempotent.
- **Validate everywhere.** Zod on the client; re-validate in Edge Functions.
- **Before committing:** `npm run typecheck && npm run lint && npm test`.

## Ask before

Any architectural change that deviates from the build spec, or filling a design gap the
spec doesn't cover (use best judgment but surface it for sign-off).
