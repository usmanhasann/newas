import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text } from '@components';
import { colors, type MoodKey } from '@theme';
import { cn } from '@utils/cn';
import { MoodPicker } from '@features/moods';
import { EntryNotShareable, useEntryCrisisCheck } from '@features/crisis';
import { reportPrivateThreat } from '@features/safety';
import {
  PostBlockedError,
  entryShareTargets,
  isShareTextBlocked,
  unshareQuestion,
  useEntryShares,
  useMyCircles,
  useShareEntry,
} from '@features/circles';
import { invokeAiSummary } from '@features/ai-summary';
import { notifyEvent } from '@features/notifications';
import { useVerifyGate } from '@features/email-verification';
import { toast } from '@store/toast';
import type { EntryShareVersion } from '@app-types/database';
import type { JournalStackParamList } from '@/navigation/types';
import {
  useCompletionHeadingResolver,
  useCreateEntry,
  useEntry,
  useUpdateEntry,
} from '../hooks';
import { EntryCompletionModal } from '../components/EntryCompletionModal';
import { canSubmitEntry, shouldRegenerateInsight, type Completion } from '../logic';
import type { EntryPatch } from '../api';

type Props = NativeStackScreenProps<JournalStackParamList, 'NewEntry'>;

/** Ask before a destructive change; resolves true only on the destructive choice. */
function confirmRemoval(q: { title: string; message: string }): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      q.title,
      q.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const SHARE_VERSIONS: {
  value: EntryShareVersion;
  title: string;
  detail: string;
  icon: 'sparkles' | 'create-outline';
}[] = [
  { value: 'reflection', title: 'AI reflection', detail: 'A gentler reflection of what you wrote.', icon: 'sparkles' },
  { value: 'written', title: 'As written', detail: 'Your words, exactly as you wrote them.', icon: 'create-outline' },
];

export function NewEntryScreen({ navigation, route }: Props) {
  const entryId = route.params?.entryId;
  const editing = !!entryId;

  // Pre-select the mood when launched from the Home "Today's Mood" quick-picker
  // (the user can still add/swap moods here). Editing prefills from the entry instead.
  const [moods, setMoods] = useState<MoodKey[]>(
    route.params?.presetMood ? [route.params.presetMood] : [],
  );
  const [note, setNote] = useState('');
  const [shareOn, setShareOn] = useState(false);
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  // What the circle sees: the gentler AI reflection (the default, as sharing always showed), or
  // the entry as written. The other version stays private either way.
  const [version, setVersion] = useState<EntryShareVersion>('reflection');
  const [saving, setSaving] = useState(false);
  // Set once a NEW entry saves successfully and its popup resolves → drives the completion modal.
  const [completion, setCompletion] = useState<{ id: string; content: Completion } | null>(null);
  // Set once an entry with concerning words is saved: the crisis resources pop-up is up and this
  // screen is done (Save stays off until it closes and the screen moves on).
  const [supportShown, setSupportShown] = useState(false);
  const prefilled = useRef(false);

  // Concerning words (client 10/14 p.36): keywords only, on the phone, never sent to any AI. An entry
  // that has them saves privately like any other, gets no AI reflection and can't be shared, and the
  // crisis resources pop-up opens as soon as it's saved. The database flags it too and is the
  // authority (entry.crisis_flagged). Offers help only; nothing is recorded about the person.
  const crisis = useEntryCrisisCheck();
  const { data: myCircles = [] } = useMyCircles();
  const shares = useEntryShares(entryId);
  // Entries go into Private circles only (a Public circle is prompts and replies), never into an
  // archived one; circles it's already in stay listed (even if left or archived since) so it can
  // always be taken out.
  const circles = entryShareTargets(myCircles, shares.data?.circles ?? []);
  const share = useShareEntry();
  // System 3 — silent private-threat check on the saved note (no UI, no consequence to the user).
  const scanPrivateThreat = (id: string) =>
    void reportPrivateThreat({ text: trimmedNote, source: 'journal_entry', sourceId: id });
  const existing = useEntry(entryId ?? '');
  const create = useCreateEntry();
  const update = useUpdateEntry(entryId ?? '');
  const resolveHeading = useCompletionHeadingResolver();
  // Resolve the popup (streak or "Entry complete") BEFORE opening the modal, so it never flips.
  // Held under `saving` on every path (incl. the verify-gate callbacks, which run after onSave's
  // finally) so Save stays disabled until the modal covers the form — no duplicate entries.
  const showCompletion = async (entry: { id: string; local_date: string }) => {
    setSaving(true);
    try {
      setCompletion({ id: entry.id, content: await resolveHeading(entry) });
    } finally {
      setSaving(false);
    }
  };
  // Sharing an entry posts into a circle, so an unverified email account must verify first.
  // The entry itself always saves (journaling is never blocked) — only the share waits.
  const { check, openVerify, gate } = useVerifyGate();

  useEffect(() => {
    if (editing && existing.data && !prefilled.current) {
      const existingMoods = existing.data.mood_slugs?.length
        ? existing.data.mood_slugs
        : [existing.data.mood_slug];
      setMoods(existingMoods as MoodKey[]);
      setNote(existing.data.note ?? '');
      prefilled.current = true;
    }
  }, [editing, existing.data]);

  // Where it's shared now (and as which version), once.
  const sharesPrefilled = useRef(false);
  useEffect(() => {
    if (editing && shares.data && !sharesPrefilled.current) {
      setShareOn(shares.data.circleIds.length > 0);
      setSelectedCircleIds(shares.data.circleIds);
      setVersion(shares.data.version ?? 'reflection');
      sharesPrefilled.current = true;
    }
  }, [editing, shares.data]);

  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  const onNoteChange = (text: string) => setNote(text);

  const toggleCircle = (id: string) =>
    setSelectedCircleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // Note is mandatory (like moods): both are required to submit anywhere an entry is created.
  const trimmedNote = note.trim();
  const hasNote = trimmedNote.length > 0;
  // An entry with concerning words can't be shared to any circle. While editing, the server's flag
  // counts too, for as long as the words it judged are still there.
  const shareBlocked =
    crisis.hasCrisisWords(trimmedNote) ||
    (editing &&
      existing.data?.crisis_flagged === true &&
      trimmedNote === (existing.data.note ?? '').trim());

  // Post the entry into exactly the circles picked now (none un-shares it), showing the chosen
  // version. The server keeps the entry's "shared" state. Best-effort: a failure never blocks or
  // undoes the saved entry, and it's surfaced, never silently swallowed (a hidden failure once
  // masked a total outage). Members are told once they can see it: a reflection share waits for
  // its reflection, which is asked for right away (it's otherwise only made when the entry is
  // opened). Announcing twice is harmless: each circle is told about an entry once, ever.
  const runShare = async (id: string, circleIds: string[]) => {
    try {
      await share.mutateAsync({ entryId: id, circleIds, version, note: trimmedNote });
      if (circleIds.length === 0) return;
      const announce = () => void notifyEvent({ type: 'share_created', entry_id: id });
      if (version === 'reflection') {
        void invokeAiSummary(id).then(announce, () => {});
      } else {
        announce();
      }
    } catch (e) {
      // Say exactly what didn't happen: nothing about where it's shared changed.
      const stillShared = (shares.data?.circleIds.length ?? 0) > 0;
      toast.error(
        e instanceof PostBlockedError
          ? stillShared
            ? `Saved, but your sharing changes weren’t made. ${e.message}`
            : `Saved, but not shared. ${e.message}`
          : circleIds.length === 0
            ? 'Saved, but couldn’t take it out of your circle. Try again from the entry.'
            : 'Saved, but couldn’t post to your circle. Try sharing again from the entry.',
      );
    }
  };

  const onSave = async () => {
    // Guard against duplicate submissions while a save is in flight (§2), and require BOTH a
    // mood and a non-empty note before anything is written.
    if (
      !canSubmitEntry({
        hasMood: moods.length > 0,
        hasNote,
        saving,
        creating: create.isPending,
        updating: update.isPending,
      })
    ) {
      return;
    }
    const noteVal = trimmedNote; // mandatory → always non-empty here
    // Concerning words: saved privately, never shared, never sent to any AI (client 10/14 p.36).
    const flaggedNow = crisis.hasCrisisWords(noteVal);
    const wantsToShare = shareOn && selectedCircleIds.length > 0 && !flaggedNow;
    setSaving(true);
    try {
      // Circle sharing requires a verified email (social / anonymous accounts pass). Journaling
      // is never blocked: if unverified we save the entry PRIVATE now and complete the share
      // after the user verifies (openVerify).
      const canShareNow = wantsToShare ? await check() : false;

      if (editing && entryId) {
        // Taking the entry out of a circle deletes its post there, replies included: ask first.
        // (Not when it now has concerning words: it can't stay shared, and what they wrote must
        // always save, so the server takes it out of its circles.)
        const keep = wantsToShare ? selectedCircleIds : [];
        const leaving = (shares.data?.circles ?? []).filter((s) => !keep.includes(s.circleId));
        const question = flaggedNow ? null : unshareQuestion(leaving);
        if (question && !(await confirmRemoval(question))) return;

        // An "As written" share shows the entry's text, and the circle sees an edit the moment
        // it's saved, so changed text gets the same check as a new post BEFORE saving. If it's
        // blocked, the entry comes out of its circles first and then saves privately.
        const sharedAsWritten =
          shares.data?.version === 'written' && shares.data.circleIds.length > 0;
        const textChanged = noteVal !== (existing.data?.note ?? '').trim();
        let blocked = false;
        if (!flaggedNow && sharedAsWritten && textChanged && (await isShareTextBlocked(noteVal))) {
          await share.mutateAsync({ entryId, circleIds: [], version: 'written', note: noteVal });
          blocked = true;
        }

        const patch: EntryPatch = { mood_slugs: moods, note: noteVal };
        // The AI insight is generated from BOTH the moods and the note, so regenerate
        // it when either changes (previously only the note was considered).
        if (shouldRegenerateInsight(existing.data, { note: noteVal, moods })) {
          patch.ai_status = 'idle';
          patch.ai_summary = null;
        }
        const updated = await update.mutateAsync(patch);
        if (flaggedNow || updated?.crisis_flagged) {
          // Saved privately: the server removed its reflection and took it out of every circle.
          setSupportShown(true);
          if (shares.data?.circleIds.length) void shares.refetch();
          crisis.showSupport(() => navigation.goBack());
          return;
        }
        scanPrivateThreat(entryId);
        if (blocked) {
          toast.error(`Saved, but not shared. ${new PostBlockedError().message}`);
          navigation.goBack();
        } else if (!wantsToShare) {
          // Toggled off (or no circles): take it out of every circle it was in.
          if (shares.data?.circleIds.length) await runShare(entryId, []);
          navigation.goBack();
        } else if (canShareNow) {
          await runShare(entryId, selectedCircleIds);
          navigation.goBack();
        } else {
          openVerify(
            async () => {
              await runShare(entryId, selectedCircleIds);
              navigation.goBack();
            },
            () => navigation.goBack(),
          );
        }
      } else {
        const entry = await create.mutateAsync({ mood_slugs: moods, note: noteVal });
        if (flaggedNow || entry.crisis_flagged) {
          // Saved privately like any other entry; no reflection, no sharing. Support first, then
          // the saved entry (where its reflection would be, the same help is offered).
          setSupportShown(true);
          crisis.showSupport(() => navigation.replace('EntryDetail', { entryId: entry.id }));
          return;
        }
        scanPrivateThreat(entry.id);
        if (!wantsToShare || canShareNow) {
          if (wantsToShare) await runShare(entry.id, selectedCircleIds);
          // Saved — surface the completion modal (no auto-navigation: the user chooses).
          await showCompletion(entry);
        } else {
          // Entry saved privately; gate the share and celebrate once it's resolved either way.
          openVerify(
            async () => {
              setSaving(true); // keep Save disabled through the share + heading lookup
              try {
                await runShare(entry.id, selectedCircleIds);
              } finally {
                await showCompletion(entry); // clears `saving` once the modal is open
              }
            },
            () => void showCompletion(entry),
          );
        }
      }
    } catch {
      // Save itself failed — do NOT confirm completion; let the user retry.
      toast.error('We couldn’t save your entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <View className="flex-row items-center justify-between py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">{editing ? 'Edit Entry' : 'New Entry'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text variant="meta" className="text-brand-500">
          {dateLabel} · {timeLabel}
        </Text>

        <Text variant="prompt" className="mt-3">
          What’s on your mind?
        </Text>
        <TextInput
          value={note}
          onChangeText={onNoteChange}
          placeholder="Write freely. This is your space."
          placeholderTextColor={colors['ink-faint']}
          multiline
          textAlignVertical="top"
          className="mt-2 rounded-lg border border-line bg-surface p-4 font-serif text-md text-ink"
          style={{ minHeight: 150 }}
        />
        {!hasNote ? (
          <Text variant="caption" className="mt-2">
            A few words are needed to save your entry.
          </Text>
        ) : null}

        <Text variant="section" className="mb-3 mt-6">
          How are you feeling?
        </Text>
        <MoodPicker value={moods} onChange={setMoods} />

        <View className="mt-6 rounded-lg border border-line bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text variant="bodyStrong">Share with a private circle</Text>
              <Text variant="caption" className="mt-0.5">
                Your circle sees your mood and the version you choose. The other stays private.
              </Text>
            </View>
            <Switch
              // With concerning words it can't be shared: trying shows why (below).
              value={shareOn && !shareBlocked}
              onValueChange={setShareOn}
              trackColor={{ true: colors.brand[400], false: colors.line }}
              thumbColor={colors.white}
              ios_backgroundColor={colors.line}
            />
          </View>

          {shareOn && shareBlocked ? (
            <View className="mt-4">
              <EntryNotShareable />
            </View>
          ) : null}

          {shareOn && !shareBlocked ? (
            <View className="mt-4 gap-2">
              {circles.length === 0 ? (
                <Text variant="caption">
                  You’re not in any private circles yet. Create or join one from the Circles tab.
                </Text>
              ) : (
                circles.map((c) => {
                  const sel = selectedCircleIds.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => toggleCircle(c.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: sel }}
                      className={cn(
                        'flex-row items-center justify-between rounded-lg border px-4 py-3',
                        sel ? 'border-brand-400 bg-brand-50' : 'border-line bg-surface-muted',
                      )}
                    >
                      <View className="flex-1 pr-2">
                        <Text variant="body">{c.name}</Text>
                        {c.removeOnly ? (
                          <Text variant="caption">
                            {c.removeOnly === 'archived'
                              ? 'Archived. You can take it out, not add it again.'
                              : 'You left this circle. You can take it out, not add it again.'}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={sel ? colors.brand[500] : colors['ink-faint']}
                      />
                    </Pressable>
                  );
                })
              )}
              {circles.length > 0 ? (
                <View className="mt-2 gap-2" accessibilityRole="radiogroup">
                  <Text variant="caption">What should they see?</Text>
                  {SHARE_VERSIONS.map((o) => {
                    const sel = version === o.value;
                    return (
                      <Pressable
                        key={o.value}
                        onPress={() => setVersion(o.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={o.title}
                        className={cn(
                          'flex-row items-center gap-3 rounded-lg border px-4 py-3',
                          sel ? 'border-brand-400 bg-brand-50' : 'border-line bg-surface-muted',
                        )}
                      >
                        <Ionicons name={o.icon} size={18} color={colors.brand[500]} />
                        <View className="flex-1">
                          <Text variant="bodyStrong">{o.title}</Text>
                          <Text variant="caption">{o.detail}</Text>
                        </View>
                        <Ionicons
                          name={sel ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={sel ? colors.brand[500] : colors['ink-faint']}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Button
          title={editing ? 'Save Changes' : 'Save Entry'}
          className="mt-8"
          disabled={!moods.length || !hasNote || saving || supportShown}
          loading={saving}
          onPress={onSave}
        />
      </ScrollView>

      {crisis.sheet}

      <EntryCompletionModal
        visible={!!completion}
        completion={completion?.content ?? null}
        onSeeSummary={() =>
          completion && navigation.replace('EntryDetail', { entryId: completion.id })
        }
        onGoHome={() => navigation.popToTop()}
      />

      {gate}
    </Screen>
  );
}
