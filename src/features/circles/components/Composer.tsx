import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, MoodPillGroup, Text } from '@components';
import { colors, type MoodKey } from '@theme';
import { MoodSheet } from './MoodSheet';

/**
 * Where people write in a circle: a new post, a prompt, or a reply. Next to the box sits a small
 * labeled "Mood" button (a mood face plus the word, so it's noticed) that opens the mood picker;
 * a mood is optional and never needed to send. Same design in Public and Private circles.
 */
export function Composer({
  placeholder,
  sendLabel,
  busy,
  replyingTo,
  onCancelReply,
  onSend,
  multilineMinHeight,
}: {
  placeholder: string;
  sendLabel: string;
  busy: boolean;
  /** "Replying to @Name", with a way to go back to replying to the post itself. */
  replyingTo?: string | null;
  onCancelReply?: () => void;
  /** Resolve true once sent (the box then clears); false keeps the draft to try again. */
  onSend: (body: string, moods: MoodKey[]) => Promise<boolean>;
  multilineMinHeight?: number;
}) {
  const [draft, setDraft] = useState('');
  const [moods, setMoods] = useState<MoodKey[]>([]);
  const [picking, setPicking] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    if (await onSend(body, moods)) {
      setDraft('');
      setMoods([]);
    }
  };

  return (
    <View>
      {replyingTo ? (
        <View className="mb-2 flex-row items-center justify-between">
          <Text variant="caption">Replying to {replyingTo}</Text>
          {onCancelReply ? (
            <Pressable onPress={onCancelReply} hitSlop={6} accessibilityRole="button">
              <Text variant="caption" className="text-brand-600">
                Cancel
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {moods.length ? <MoodPillGroup moods={moods} className="mb-2" /> : null}

      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={colors['ink-faint']}
        multiline
        textAlignVertical="top"
        className="rounded-lg border border-line bg-surface px-3 py-2 font-sans text-base text-ink"
        style={{ minHeight: multilineMinHeight ?? 44, maxHeight: 140 }}
      />

      <View className="mt-2 flex-row items-center justify-between">
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={moods.length ? 'Change mood' : 'Add a mood'}
          hitSlop={6}
          className="flex-row items-center gap-1.5 rounded-full border border-line px-3 py-1.5"
        >
          <Ionicons name="happy-outline" size={18} color={colors.brand[500]} />
          <Text variant="caption" className="text-brand-600">
            Mood
          </Text>
        </Pressable>
        <Button
          title={sendLabel}
          size="sm"
          fullWidth={false}
          disabled={!draft.trim() || busy}
          loading={busy}
          onPress={send}
        />
      </View>

      <MoodSheet
        key={picking ? 'open' : 'closed'}
        visible={picking}
        value={moods}
        onClose={() => setPicking(false)}
        onDone={(m) => {
          setMoods(m);
          setPicking(false);
        }}
      />
    </View>
  );
}
