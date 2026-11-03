/**
 * The main paywall's purple card (client revisions 10/14 p.33 to p.35): the person's first
 * reflection, its first sentence readable and the rest blurred, under "WRITTEN FOR YOU" (from their
 * first check in) or "BASED ON YOUR ANSWERS" (they skipped it, or it had concerning words). See
 * ../firstReflection for the rules.
 *
 * It waits for the reflection ("Writing your reflection..."), shows it the moment it's ready, and
 * offers "Try again" if it failed, retrying inside the card: the paywall and the selected plan stay
 * as they are. If nobody started the reflection (the app was closed in between), it starts it.
 */
import { useEffect, useRef, useState } from 'react';
import { useEntry } from '@features/journal';
import { useGenerateSummary } from '@features/ai-summary';
import { useCrisisKeywords, detectCrisis } from '@features/crisis';
import {
  useRequestWelcomeReflection,
  useWelcomeReflection,
} from '@features/welcome-reflection';
import { PILL_START_TRIAL, splitFirstSentence } from '../paywallCopy';
import {
  WRITING_STALL_MS,
  entryFlagged,
  reflectionCard,
  reflectionSource,
  shouldStartWriting,
  sourceLabel,
  type FirstEntry,
} from '../firstReflection';
import { PreviewCard } from './PreviewCard';

/** How often to look at the entry while its reflection is being written. */
const ENTRY_POLL_MS = 3000;

export function FirstReflectionCard({ entryId }: { entryId: string | null | undefined }) {
  const id = entryId ?? '';
  const entryQ = useEntry(id);
  const keywordsQ = useCrisisKeywords();
  const entry: FirstEntry | null | undefined = entryId ? entryQ.data : null;

  const flagged =
    entry && entryId ? entryFlagged(entry, keywordsQ.data ?? null, detectCrisis) : null;
  const source = reflectionSource({
    entryId,
    entry,
    flagged,
    keywordsFailed: keywordsQ.isError,
    entryFailed: !!entryId && entryQ.isError,
  });

  const welcomeQ = useWelcomeReflection({ enabled: source === 'answers' });
  const welcome = source === 'answers' ? welcomeQ.data : undefined;
  const genEntry = useGenerateSummary(id);
  const genWelcome = useRequestWelcomeReflection();

  // Start it if nobody did (once per screen).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (!shouldStartWriting({ source, entry, welcome })) return;
    started.current = true;
    if (source === 'entry') genEntry.mutate();
    else genWelcome.mutate();
  }, [source, entry, welcome, genEntry, genWelcome]);

  const requestFailed = source === 'entry' ? genEntry.isError : genWelcome.isError;
  const retrying = source === 'entry' ? genEntry.isPending : genWelcome.isPending;

  // Stuck "writing" (a request that never finished): after a while, offer "Try again".
  const [stalled, setStalled] = useState(false);
  const base = reflectionCard({ source, entry, welcome, requestFailed, stalled: false });
  const waiting = base.state === 'writing' && source !== null && !retrying;
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setTimeout(() => setStalled(true), WRITING_STALL_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  // The entry's reflection is written by another request (started on the check in): look again
  // until it's there. (The welcome reflection's query polls by itself.)
  const refetchEntry = entryQ.refetch;
  const pollEntry = source === 'entry' && base.state === 'writing';
  useEffect(() => {
    if (!pollEntry) return undefined;
    const t = setInterval(() => void refetchEntry(), ENTRY_POLL_MS);
    return () => clearInterval(t);
  }, [pollEntry, refetchEntry]);

  const card = reflectionCard({ source, entry, welcome, requestFailed, stalled });
  const { first, rest } = splitFirstSentence(card.text);

  const onRetry = () => {
    setStalled(false);
    if (source === 'entry') genEntry.mutate();
    else genWelcome.mutate();
  };

  return (
    <PreviewCard
      testID="first-reflection-card"
      label={sourceLabel(source)}
      state={card.state}
      readable={first}
      blurred={rest}
      blurLines={3}
      pill={PILL_START_TRIAL}
      onRetry={source ? onRetry : undefined}
      retrying={retrying}
    />
  );
}
