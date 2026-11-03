# Circles — Posts & Replies

**Status:** Approved 2026-09-14 · **Version:** 0.1 · **Owner:** Engineering
Reviewable artifact: https://claude.ai/code/artifact/aacdf976-4f76-4b50-9bf7-5d1c4ca97754
Companion to `design_and_spec/trust-safety-design.md` (this is System 1's posting surface).

Turns Circles into ALSO a text forum. Two deliberately **separate** interaction models sharing only
the reply-thread mechanic.

## Ratified decisions
1. **Coexist** — Posts are a new tab alongside the existing journal-sharing **Board** (kept). A Circle
   has **Board + Posts + Members**.
2. **Two models are genuinely separate** — distinct feeds/logic, not one component with flags.
3. Design-doc-first. 4. The join popup's grey **"Not not"** = **"Not now"**.

## Shared mechanic — the reply thread
A reply collapses under its parent behind **"View replies (N)"** (or **"Reply"** when there are none
or a single one) and opens in its own thread view. Replies are **never** inline in a Circle's main
scroll, so a post with thousands of replies takes the same feed space as one with none. Infinite
nesting.

## Public Circles — creator-led
- **Posting:** only the **creator** starts top-level posts/prompts (unlimited, all kept, none
  replaced/archived); **any member** replies. The **main feed shows only the creator's posts**
  (newest-first); replies open per-thread. Feed query: `circle_id=? and parent_id is null and
  author_id=owner order by created_at desc`.
- **Membership:** **open** (join instantly). Creator can **remove a reply** and **BAN** a user — a real
  ban (a removal would let them rejoin an open Circle); a banned user can never rejoin that Circle. If
  the creator deletes their account or leaves → **archived** (content visible, no new prompts, no
  auto-transfer).

## Private Circles — group chat
- **Posting:** **any member** posts top-level (newest-first, not bottom-anchored chat). Replies use the
  same collapsed mechanic.
- **Membership:** any member invites; **owner approves** (invites don't auto-admit). Owner gets a
  notification **and** a persistent **Pending requests** section (badge/counter). Owner can remove any
  member.
- **Additive notification:** notify on **every new post** (not just replies), **on by default**,
  mutable **per Circle** — like an iMessage group. Applies to Private only.

## Shared rules
- **No editing — delete only** (protects the moderation flag system).
- **Hearts only** on any post/reply (emoji reactions stay on the Board).
- Moderation (harassment/threat detection, report button, block/mute, tiered enforcement) applies to
  both types; a moderation removal always tells the user what & why (no silent removals).

## Discovery (Public)
One flat, browsable list of all Public Circles — name, short description, member count — sorted by
**member count, highest first**. Tapping → a popup: **"Join"** (purple) / **"Not now"** (grey), no
approval. Search/categories/recommendations deferred.

## Data model (Phase 1 — `20260914120000_circle_posts.sql`)
- `circles` +`description`, +`member_count` (trigger), +`archived_at`; owner FK → `on delete set null`
  + trigger archives the Circle when ownerless.
- `circle_posts` — top-level posts AND replies (one table; `parent_id` null = top-level). Soft-delete
  (`deleted_at/by/reason`) is for **moderation removal**; a user deleting their own post is a **hard
  DELETE**. Trigger-maintained `reply_count` (direct, non-deleted) + `like_count`.
- `post_reactions` — one heart per (post, user).
- `circle_bans` — `unique (circle_id, user_id)`; a RESTRICTIVE `circle_members` insert policy blocks
  banned rejoin.
- `circle_post_mutes` — per-Circle Private mute; **absence = ON**.
- `can_post_in_circle(cid, top_level)` SQL helper + RLS: SELECT = approved member (suspension "can't
  view" is client-gated for feed perf); INSERT = self + can_post; DELETE = author OR (Public) owner;
  no UPDATE (no edits). Standing gate via `my_circle_standing()`.

Pure client mirror: `src/features/circles/postingLogic.ts` — `circlePostPermissions`,
`sortPublicCirclesByMembers`, `replyAffordanceLabel` (tested).

## Notifications (via `send-push`)
New prompt (Public) · reply to your message (both) · new post by any member (Private, default-on,
per-Circle mute) · added/approved (Private, reuses `added_to_circle`) · removed by moderation (both) ·
new join request (Private owner).

## Screens
CircleDetailScreen +Posts tab (component swaps by type) · PostThreadScreen (shared) · DiscoveryScreen +
Join popup · Pending requests section · per-post controls (Report / Delete / Heart / Block-Mute).

## Phasing
- **P1** — schema + RLS + counts + pure logic. *(built; migration not applied)*
- **P2** — shared reply thread (data + PostThreadScreen).
- **P3** — Public Circles + Discovery.
- **P4** — Private Circles + approvals + per-Circle notifications.
- **P5** — notifications fan-out + full System 1 moderation wiring.

## Open questions
Ban reach (delete banned user's posts too?) · circle `description` author/timing · Private invite
mechanism (code/email/pick-a-connection) · max visual reply indent · default tab (Board vs Posts).
