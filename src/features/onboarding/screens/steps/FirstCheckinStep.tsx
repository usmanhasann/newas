/**
 * Screen 9: the first check in. A real mood entry through the existing check-in system. Duplicate
 * entries are prevented, and nothing here ever blocks onboarding.
 *
 * Client revisions 10/14 p.33 to p.35 (N15): there is no reflection page after it any more.
 *  - "Save & reflect": the concerning-words check runs first (keywords only, never sent to any AI,
 *    N18). Not flagged: the AI reflection starts in the background (useGenerateSummary) and the step
 *    goes straight on, so it's being written while they create their account; the paywall shows it
 *    the moment it's ready (FirstReflectionCard polls the entry, and starts it if nobody did).
 *    Flagged: the entry is saved privately with no AI reflection, the crisis resources pop-up opens
 *    first, the answers-based "Welcome reflection" starts, and the step goes on once the pop-up is
 *    closed (reflection_status 'flagged').
 *  - "Skip for now": the Welcome reflection (from the onboarding answers) starts the moment they tap.
 *  - Coming back to this step after saving (Back from the next step, or resuming): the saved check
 *    in shows with a Continue button, never a second composer (no duplicate entry).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, View, useWindowDimensions, type TextInput } from 'react-native';
import { Button, Card, Text, TextField, MoodPillGroup } from '@components';
import { MoodPicker } from '@features/moods';
import { toast } from '@store/toast';
import { isMoodKey, type MoodKey } from '@theme';
import { useCreateEntry, useEntry } from '@features/journal';
import { useGenerateSummary } from '@features/ai-summary';
import { useEntryCrisisCheck } from '@features/crisis';
import { reportPrivateThreat } from '@features/safety';
import { useStartWelcomeReflection } from '@features/welcome-reflection';
import { StepScaffold } from '../../components/StepScaffold';
import { useKeyboardComposer } from '../../useKeyboardComposer';
import { NOTE_MIN_HEIGHT, noteMaxHeight } from '../../keyboardScroll';
import { trackOnboarding } from '../../analytics';
import type { OnboardingData } from '../../types';
import type { StepProps } from '../types';

export function FirstCheckinStep({ nav }: StepProps) {
  const [moods, setMoods] = useState<MoodKey[]>([]);
  const [note, setNote] = useState('');
  // The saved check in (this session, or from before: Back from the next step, or a resume).
  const [entryId, setEntryId] = useState<string | null>(nav.data.first_entry_id ?? null);
  // Saved and on the way to the next step (the crisis pop-up first, if it's open): the composer
  // stays as it was until the step changes.
  const [moving, setMoving] = useState(false);
  // Continue pressed on the saved check in: it stays on screen until the step changes.
  const [continuing, setContinuing] = useState(false);
  // The just-saved entry whose reflection starts once the reflection hook points at it.
  const startReflectionFor = useRef<string | null>(null);
  // The note box stays visible and centered above the keyboard (client 10/14 p.6-7).
  const noteBoxRef = useRef<View>(null);
  const noteInputRef = useRef<TextInput>(null);
  const keyboard = useKeyboardComposer({ boxRef: noteBoxRef, inputRef: noteInputRef });
  const { height: windowHeight } = useWindowDimensions();

  const create = useCreateEntry();
  // Concerning words: keywords only, checked when the check in is saved (offers help only).
  const crisis = useEntryCrisisCheck();
  const startWelcome = useStartWelcomeReflection();
  const [savedWithCrisisWords, setSavedWithCrisisWords] = useState(false);
  const entryQ = useEntry(entryId ?? '');
  const gen = useGenerateSummary(entryId ?? '');
  const entry = entryQ.data;
  // The server's flag is the authority (and survives resuming onboarding); the phone's keyword
  // check covers a server that doesn't set it yet.
  const flagged =
    savedWithCrisisWords ||
    !!entry?.crisis_flagged ||
    (!!entry && crisis.hasCrisisWords(entry.note));

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'firstCheckin' });
  }, []);

  const moveOn = useCallback(
    async (extra: OnboardingData) => {
      try {
        await nav.goNext(extra);
      } catch {
        // The step couldn't be saved: stay, showing the saved check in with Continue to try again.
        setMoving(false);
        setContinuing(false);
        toast.error('We couldn’t continue. Please try again.');
      }
    },
    [nav],
  );

  // Not flagged: start the reflection in the background and go straight on (client p.33). Runs once
  // the reflection hook points at the new entry (it is bound to an entry id).
  useEffect(() => {
    const id = startReflectionFor.current;
    if (!id || id !== entryId) return;
    startReflectionFor.current = null;
    gen.mutate();
    void moveOn({ first_entry_id: id, reflection_status: 'pending' });
  }, [entryId, gen, moveOn]);

  const onNoteChange = (text: string) => {
    setNote(text);
    keyboard.note.onTextChange();
  };

  const onSave = async () => {
    Keyboard.dismiss(); // a tap outside the note box closes the keyboard (client 10/14 p.7)
    // A mood AND a non-empty note are both required (mandatory everywhere an entry is created).
    if (!moods.length || !note.trim() || create.isPending || moving || entryId) return; // no dup / empty
    let created: Awaited<ReturnType<typeof create.mutateAsync>>;
    try {
      created = await create.mutateAsync({ mood_slugs: moods, note: note.trim() });
    } catch (e) {
      toast.error('We couldn’t save that. Please try again.');
      throw e;
    }
    const id = created.id;
    trackOnboarding('first_checkin_completed');
    setMoving(true);
    if (created.crisis_flagged || crisis.hasCrisisWords(note)) {
      // Saved privately like any other entry; its words never go to any AI. Support first (the
      // keyboard closes); the reflection is written from the onboarding answers instead, and the
      // step goes on once the pop-up is closed (client p.35).
      setSavedWithCrisisWords(true);
      setEntryId(id);
      startWelcome();
      crisis.showSupport(() => {
        void moveOn({ first_entry_id: id, reflection_status: 'flagged' });
      });
      // So a resume while the pop-up is open knows the check in exists (best effort).
      nav.persist({ first_entry_id: id }).catch(() => undefined);
      return;
    }
    // System 3: silent private-threat check on the check-in note (no UI, no consequence).
    void reportPrivateThreat({ text: note.trim(), source: 'checkin_note', sourceId: id });
    startReflectionFor.current = id;
    setEntryId(id);
  };

  // The saved check in, shown again (Back from the next step, or a resume): straight on. A reflection
  // that hasn't started yet is started by the paywall, which checks the entry again first.
  const onContinue = () => {
    if (!entryId || continuing) return;
    if (flagged) startWelcome();
    setContinuing(true);
    void moveOn({
      first_entry_id: entryId,
      reflection_status: flagged ? 'flagged' : (entry?.ai_status ?? 'pending'),
    });
  };

  // The first check in is optional. Skipping creates no entry; the reflection is written from the
  // onboarding answers, starting the moment they tap (client p.33). Guarded so it can't fire
  // mid-save or after an entry already exists.
  const onSkip = () => {
    Keyboard.dismiss();
    if (create.isPending || moving || entryId) return;
    trackOnboarding('first_checkin_skipped');
    startWelcome();
    void moveOn({ reflection_status: 'skipped' });
  };

  const onBack = () => {
    Keyboard.dismiss();
    nav.goBack();
  };

  const showSaved = !!entryId && !moving;
  // What they picked: from the saved entry (survives resume), else what's still in local state.
  const savedMoods = entry?.mood_slugs?.filter(isMoodKey) ?? moods;
  const savedNote = (entry?.note ?? note ?? '').trim();

  return (
    <StepScaffold
      // Separate layouts: the saved check in opens at its top, not where the composer was scrolled.
      key={showSaved ? 'saved' : 'compose'}
      canBack={nav.canBack}
      onBack={onBack}
      progress={nav.progress}
      // Composing: title, moods, note AND buttons scroll as one, and the note box is centered above
      // the keyboard when it opens and kept in view while typing.
      composer={showSaved ? undefined : keyboard.scroll}
      composerScrollRef={keyboard.refs.scrollRef}
      composerContentRef={keyboard.refs.contentRef}
      scroll
      title="Let’s try your first check in."
      footer={
        showSaved ? (
          <Button title="Continue" loading={continuing} onPress={onContinue} />
        ) : (
          <View className="gap-2">
            <Button
              title="Save & reflect"
              disabled={!moods.length || !note.trim() || (moving && crisis.supportOpen)}
              loading={create.isPending || (moving && !crisis.supportOpen)}
              onPress={onSave}
            />
            <Button
              title="Skip for now"
              variant="ghost"
              disabled={create.isPending || moving}
              onPress={onSkip}
            />
          </View>
        )
      }
    >
      {showSaved ? (
        <View className="gap-4" testID="first-checkin-saved">
          {savedMoods.length ? <MoodPillGroup moods={savedMoods} size="lg" /> : null}
          {savedNote ? (
            <View>
              <Text variant="section" className="mb-2">
                What you wrote
              </Text>
              <Card elevated={false} className="bg-surface-muted">
                <Text variant="entry">{savedNote}</Text>
              </Card>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="gap-4">
          <Text variant="bodyMuted">Pick up to three moods for right now.</Text>
          {/* One tap on a mood picks it and closes the keyboard (client 10/14 p.7). */}
          <MoodPicker
            value={moods}
            onChange={setMoods}
            onInteract={Keyboard.dismiss}
            keyboardShouldPersistTaps="handled"
          />
          {/* Label + box, measured to keep them above the keyboard. The box keeps its size when the
              keyboard opens; it grows with new lines up to a fixed height, then scrolls inside
              (the phone keeps the typed line in view). What was typed stays when the keyboard
              closes, and a tap goes back to it. */}
          <View
            ref={noteBoxRef}
            testID="note-box"
            collapsable={false}
            onLayout={keyboard.note.onBoxLayout}
          >
            <TextField
              ref={noteInputRef}
              label="What’s on your mind?"
              placeholder="A sentence is plenty…"
              value={note}
              onChangeText={onNoteChange}
              onFocus={keyboard.note.onFocus}
              onBlur={keyboard.note.onBlur}
              multiline
              scrollEnabled
              style={{
                minHeight: NOTE_MIN_HEIGHT,
                maxHeight: noteMaxHeight(windowHeight),
                textAlignVertical: 'top',
              }}
            />
          </View>
        </View>
      )}

      {crisis.sheet}
    </StepScaffold>
  );
}
