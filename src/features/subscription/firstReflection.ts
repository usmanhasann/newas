/**
 * Which first reflection the main paywall's purple card shows, and in what state (client revisions
 * 10/14 p.33 to p.35). Pure, so every case is unit-tested.
 *
 * - They journaled on "Let's try your first check in": the reflection on that entry ("WRITTEN FOR
 *   YOU"), made by ai-summary in the background while they create their account.
 * - They tapped "Skip for now", or the entry had concerning words (N18: it gets no AI reflection and
 *   its text is never sent to the AI): the reflection written from their onboarding answers ("BASED
 *   ON YOUR ANSWERS"), which is also kept as the Welcome reflection card on the Journal tab.
 * - Not ready yet: "Writing your reflection..." until it is. Failed (or stuck): "Failed to load" with
 *   "Try again".
 */
import type { AiStatus, CrisisKeyword } from '@app-types/database';
import { LABEL_BASED_ON_ANSWERS, LABEL_WRITTEN_FOR_YOU } from './paywallCopy';

export type ReflectionSource = 'entry' | 'answers';
export type CardState = 'writing' | 'ready' | 'failed';

/** The bits of the first entry the paywall reads. */
export interface FirstEntry {
  note: string | null;
  ai_status: AiStatus;
  ai_summary: string | null;
  /** The server's concerning-words flag (N18, migration 20261022120000); absent on an older server. */
  crisis_flagged?: boolean | null;
}

/** The bits of the welcome reflection the paywall reads (null: none yet). */
export interface WelcomeRow {
  status: 'pending' | 'ready' | 'failed' | 'deleted';
  body: string | null;
}

/** How long "Writing your reflection..." may wait on a reflection nobody is still writing. */
export const WRITING_STALL_MS = 60_000;

/**
 * Whether an entry had concerning words. The server's flag decides when the server has it (N18);
 * on an older server, the phone's keyword check (the same list) does. `keywords` null: not loaded
 * yet (undecided).
 */
export function entryFlagged(
  entry: Pick<FirstEntry, 'note' | 'crisis_flagged'>,
  keywords: CrisisKeyword[] | null,
  detect: (text: string | null | undefined, keywords: CrisisKeyword[]) => unknown,
): boolean | null {
  if (typeof entry.crisis_flagged === 'boolean') return entry.crisis_flagged;
  if (!keywords) return null;
  return detect(entry.note, keywords) != null;
}

/**
 * Where the card's reflection comes from; null while that isn't known yet (the entry or the keyword
 * list is still loading). An entry that can't be checked is never sent to the AI: it falls back to
 * the answers.
 */
export function reflectionSource(input: {
  entryId: string | null | undefined;
  /** undefined: still loading; null: not found. */
  entry: FirstEntry | null | undefined;
  /** entryFlagged(); null while undecided. */
  flagged: boolean | null;
  /** The keyword list couldn't be loaded (so the entry can't be checked). */
  keywordsFailed: boolean;
  entryFailed: boolean;
}): ReflectionSource | null {
  if (!input.entryId) return 'answers';
  if (input.entryFailed) return 'answers';
  if (input.entry === undefined) return null;
  if (input.entry === null) return 'answers';
  if (input.flagged === true) return 'answers';
  if (input.flagged === false) return 'entry';
  return input.keywordsFailed ? 'answers' : null;
}

export function sourceLabel(source: ReflectionSource | null): string | null {
  if (source === 'entry') return LABEL_WRITTEN_FOR_YOU;
  if (source === 'answers') return LABEL_BASED_ON_ANSWERS;
  return null;
}

/** The card's state and text for the chosen source. `stalled`: writing for too long. */
export function reflectionCard(input: {
  source: ReflectionSource | null;
  entry: FirstEntry | null | undefined;
  welcome: WelcomeRow | null | undefined;
  /** The request this screen made failed. */
  requestFailed: boolean;
  stalled: boolean;
}): { state: CardState; text: string | null } {
  const { source } = input;
  if (source === null) return { state: 'writing', text: null };

  if (source === 'entry') {
    const e = input.entry;
    if (e && e.ai_status === 'ready' && e.ai_summary)
      return { state: 'ready', text: e.ai_summary };
    if (input.requestFailed) return { state: 'failed', text: null };
    if (!e || e.ai_status === 'failed' || e.ai_status === 'ready')
      return { state: 'failed', text: null };
    return { state: input.stalled ? 'failed' : 'writing', text: null };
  }

  const w = input.welcome;
  if (w && w.status === 'ready' && w.body) return { state: 'ready', text: w.body };
  if (input.requestFailed) return { state: 'failed', text: null };
  if (w && (w.status === 'failed' || w.status === 'deleted' || w.status === 'ready')) {
    return { state: 'failed', text: null };
  }
  return { state: input.stalled ? 'failed' : 'writing', text: null };
}

/**
 * Whether the paywall should start writing the reflection itself: the entry's was never asked for
 * (idle), or there is no welcome reflection yet (Skip for now normally starts it the moment it's
 * tapped; this covers an app closed in between).
 */
export function shouldStartWriting(input: {
  source: ReflectionSource | null;
  entry: FirstEntry | null | undefined;
  /** undefined: still loading. */
  welcome: WelcomeRow | null | undefined;
}): boolean {
  if (input.source === 'entry') return input.entry?.ai_status === 'idle';
  if (input.source === 'answers') return input.welcome === null;
  return false;
}
