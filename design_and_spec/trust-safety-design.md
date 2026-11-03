# LYSM Trust & Safety — Safety & Moderation Architecture

**Status:** Approved 2026-09-11 · **Version:** 0.1 · **Owner:** Engineering
Reviewable version (artifact): https://claude.ai/code/artifact/b25cbaf8-4d6e-49a6-9733-87b8841cb847

Three **independent** safety systems — separate detection, separate consequences, a hard wall
between them. Never route crisis or private-threat detection through the harassment enforcement path.

## Ratified decisions
1. **Circles text (System 1):** the free-text posting/comment surface is coming separately. Build
   the moderation plumbing now as a reusable service; wire detection to that surface when it ships.
2. **Detection method:** hybrid — an on-device keyword prescreen; an AI Edge Function only
   confirms/expands on a possible hit, so text that doesn't trip a prescreen never leaves the phone.
3. **Human review:** the Supabase dashboard, on purpose-built moderation tables/views (no admin app yet).
4. **Sequencing:** design doc first (this) → then phased implementation.

## Principles
- **Three walls, not one pipeline.** Separate detectors, tables, and consequences per system.
- **Support is never punishment.** System 2 can only offer help — no flag/warning/restriction/strike,
  ever, even in a private journal.
- **Private stays private on the happy path.** On-device prescreen first; only a possible-hit excerpt
  is sent to AI.
- **No silent penalties.** Every enforcement action tells the user what content triggered it and why,
  and offers an appeal.
- **Automation stops at suspension review.** Auto-remove/restrict/suspend-Circles is allowed; full
  account suspension and all legal next-steps are human decisions only.

## Routing (which surface → which system)
| Surface | Systems |
| --- | --- |
| Circle post/comment (free text — future surface) | 1 harassment · 2 crisis |
| Journal entry note (private) | 2 crisis · 3 private-threat |
| Check-in note (private) | 2 crisis · 3 private-threat |
| AI-generated share summary | none (machine-written, not user-authored) |
| Emoji reaction | none (no free text) |

Journal/check-in text is **never** scanned for harassment (System 1). One entry can trip more than
one system independently (e.g. a threat toward someone else + self-harm intent → System 3 flag AND
System 2 resources, with no interaction).

## System 1 — Circles harassment / threats / doxxing
Scope: free text posted in Private & Public Circles only. **No posting surface exists yet**, so
System 1 is built as a reusable service — `moderateCircleText(authorId, contextRef, text)` — that the
post/comment feature calls when it lands.

- **Detection (hybrid, split by confidence):**
  - *Pre-post block* — high-confidence, clearly-severe (explicit directed threats/hate speech): an
    on-device severe prescreen; if it trips, a synchronous AI confirm; confirmed severe → rejected
    before saving, user sees an immediate reason + Appeal. Content never goes live.
  - *Post-post scan* — everything else (harassment, inappropriate language, unclear intent, borderline,
    doxxing): posts normally, async AI scan within seconds; flagged → auto-hidden + tiered enforcement.
  - *Doxxing* — sharing another person's address/phone/workplace/identifying detail. A real name alone
    is fine and is never flagged.
- **Enforcement (tiered; pure engine in `supabase/functions/_shared/moderation.ts`):**
  - Tier 1 (first offense, low severity): content removed, in-app warning, no restriction, strike.
  - Tier 2 (second offense, or first at moderate severity): removed, **3–5 day** posting restriction
    by severity (default low=3, moderate=5 — open question P4), strike.
  - Tier 3 (third offense, or any single severe offense): **Circles suspended indefinitely** pending
    human review; keeps journal/check-ins/reflections/**subscription**; can't post or view Circles.
  - Full account suspension is **human-only**, never automatic.
- **Gating:** restricted → can't post (submit-time + RLS); suspended → can't post or read Circles.
- **Appeals:** pre-post rejections and every strike carry an Appeal that opens a review-queue row.
- **Reporting:** a Report button on every post/comment → `circle_reports` → real review + action.
- **Block/mute:** independent of reporting. Block = mutual invisibility; mute = one-directional.

## System 2 — Crisis language (app-wide support)
Scope: every free-text surface. **Never** any flag/warning/restriction/penalty — even in a private
journal. Shares no table or code path with Systems 1/3.
- Detects suicidal ideation / self-harm intent (hopelessness + plan/timeframe, or direct intent).
- Hybrid: existing on-device crisis matcher (expanded) → `detect-crisis` AI confirm on a hit.
- Response: the existing `CrisisResourcesSheet` (988, Crisis Text Line, international) opens
  automatically + immediately.
- Records nothing punitive — no user-linked storage; at most an anonymous aggregate count.
- Already partly built: on-device keyword matching on journal notes (`src/features/crisis`). System 2
  = add AI-confirm + run on every free-text surface.

## System 3 — Private threats against another person
Scope: threats of violence toward a specific person, written in a **private** journal/check-in.
- Detect → flag → notify. **No** automated consequence, nothing the user sees.
- Hybrid: on-device prescreen → `detect-private-threat` AI confirm.
- Writes `private_threat_flags` (excerpt, assessment, `pending_review`) — **service-role only, never
  client-readable** — and notifies the review team.
- A human assesses. Legal next-steps (duty to warn/report; excerpt retention) are pending separate
  guidance; this ships detect→flag→notify only, with access-controlled excerpts + configurable retention.

## Data model (Phase 1 — migration `20260911130000_moderation_foundations.sql`)
| Table | System | Client read access |
| --- | --- | --- |
| `circle_strikes` | 1 | own only |
| `circle_restrictions` | 1 | own only |
| `circle_suspensions` | 1 | own only |
| `circle_reports` | 1 | own (reporter) |
| `moderation_appeals` | 1 | own |
| `user_blocks` | 1 | own (blocker) |
| `moderation_actions` (audit) | 1 | none (service role) |
| *(none)* | 2 | — (stores nothing about a person) |
| `private_threat_flags` | 3 | **none — service role only** |

- Consequence writes happen only in Edge Functions (service role). Client gets read-only access to its
  own state and may INSERT only its own reports/appeals/blocks.
- `my_circle_standing()` (SECURITY DEFINER, no-arg → `auth.uid()`) returns `ok|restricted|suspended`;
  mirrors `deriveStanding()` in the engine; used by the client and (Phase 4) by RLS on the posting surface.
- Review views for the dashboard: `moderation_reports_open`, `moderation_appeals_open`,
  `moderation_suspensions_open`, `private_threat_flags_open` (all revoked from app roles).

## Edge functions (Phases 2–4)
Provider-agnostic OpenAI-compatible setup already used by `ai-summary`/`generate-reflections`
(`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`); server-only key; rate-limited, Zod-validated, idempotent.
- `moderate-circle-content` (S1) — sync severe-confirm + async full scan.
- `detect-crisis` (S2) — on a prescreen hit; returns show-resources; no record, no penalty.
- `detect-private-threat` (S3) — on a prescreen hit (private only); writes a flag + notifies reviewers.
On-device prescreen lives in a shared `safety` module (evolution of `crisis/matcher.ts`), separate
keyword set per system; the AI layer re-validates independently.

## Phasing
- **Phase 0** — this design → sign-off. *(done)*
- **Phase 1** — foundations: schema + RLS + pure enforcement engine + tests. *(built; migration not yet applied)*
- **Phase 2** — System 2 crisis (highest safety value, no posting-surface dependency).
- **Phase 3** — System 3 private-threat: detect → flag → notify.
- **Phase 4** — System 1 Circles moderation + block/mute + report button (wired to the posting surface). Depends on that surface's spec.

## Open questions (none block Phase 1)
- **P4** Circles posting-surface spec & timeline (to wire report button, block/mute UI, pre-post gate).
- **P4** Exact Tier-2 severity→duration map, and the definition/threshold of "inappropriate language" vs. a slur.
- **P2/P3** AI provider/model for detection + privacy sign-off on sending possible-hit private excerpts to it.
- **P3** Reviewer notification channel (email/Slack/dashboard watch) + interim retention for flagged excerpts.
- **P1** Which staff get Supabase review access + how they authenticate; appeal-review SLA.
