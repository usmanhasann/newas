/**
 * The "Welcome reflection" card at the top of the Journal tab (client revisions 10/14 p.35, N15):
 * the reflection written from the onboarding answers when the person skipped the first check in
 * (or it had concerning words). Tapping it opens the full reflection. It stays until the person
 * deletes it (••• > Delete, after "Delete your welcome reflection? This can’t be undone."); it never
 * disappears on its own. Renders nothing when there is none (or it was deleted).
 *
 * Self-contained: the Journal tab only places <WelcomeReflectionCard /> at the top of its list.
 */
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Text } from '@components';
import { colors, shadow, spacing } from '@theme';
import { toast } from '@store/toast';
import { withoutDashes } from '@utils/text';
import {
  useDeleteWelcomeReflection,
  useRequestWelcomeReflection,
  useWelcomeReflection,
} from '../hooks';

const WELCOME_REFLECTION_TITLE = 'Welcome reflection';
const DELETE_CONFIRM_TITLE = 'Delete your welcome reflection?';
const DELETE_CONFIRM_BODY = 'This can’t be undone.';

/** Ask first: it can't be undone. `onConfirm` runs only on "Delete". */
function confirmDeleteWelcomeReflection(onConfirm: () => void): void {
  Alert.alert(DELETE_CONFIRM_TITLE, DELETE_CONFIRM_BODY, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

function FullReflection({
  text,
  visible,
  onClose,
}: {
  text: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen contentClassName="py-4">
        <View className="h-9 flex-row items-center">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            className="-ml-1 p-1"
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <Text variant="h1" accessibilityRole="header" className="mb-4 mt-2">
            {WELCOME_REFLECTION_TITLE}
          </Text>
          <View className="rounded-lg bg-brand-600 p-5">
            <View className="mb-3 flex-row items-center gap-2">
              <Ionicons name="sparkles-outline" size={14} color={colors.white} />
              <Text variant="section" className="text-ink-inverse">
                BASED ON YOUR ANSWERS
              </Text>
            </View>
            <Text className="font-serif text-xl leading-relaxed text-ink-inverse">{text}</Text>
          </View>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function CardMenu({
  open,
  anchorTop,
  onClose,
  onDelete,
}: {
  open: boolean;
  anchorTop: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping anywhere outside the menu closes it. A sibling of the menu (not its parent), so
          screen readers still reach "Delete"; they close it with the escape gesture. */}
      <Pressable
        testID="welcome-menu-backdrop"
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        className="absolute inset-0"
      />
      <View
        accessibilityRole="menu"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        className="absolute right-5 rounded-md border border-line bg-surface py-1"
        style={[shadow.card, { top: anchorTop }]}
      >
        <Pressable onPress={onDelete} accessibilityRole="menuitem" className="px-5 py-3">
          <Text variant="bodyStrong" className="text-danger-strong">
            Delete
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function WelcomeReflectionCard() {
  const q = useWelcomeReflection();
  const retry = useRequestWelcomeReflection();
  const remove = useDeleteWelcomeReflection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState<number>(spacing[24]);
  const [reading, setReading] = useState(false);
  const menuButton = useRef<View>(null);

  const w = q.data;
  if (!w || w.status === 'deleted') return null;

  const text = w.status === 'ready' && w.body ? withoutDashes(w.body) : null;
  const failed = w.status === 'failed' || (w.status === 'ready' && !w.body);

  const openMenu = () => {
    // Open under the ••• button (window coordinates); a first guess until it's measured.
    menuButton.current?.measureInWindow((_x, y, _w, h) => setMenuTop(y + h + spacing[1]));
    setMenuOpen(true);
  };

  const onDelete = () => {
    setMenuOpen(false);
    confirmDeleteWelcomeReflection(() =>
      remove.mutate(undefined, {
        onError: () => toast.error('We couldn’t delete that. Please try again.'),
      }),
    );
  };

  return (
    <>
      <Pressable
        onPress={text ? () => setReading(true) : undefined}
        disabled={!text}
        accessibilityRole={text ? 'button' : undefined}
        accessibilityHint={text ? 'Opens the full reflection' : undefined}
        testID="welcome-reflection-card"
      >
        <Card className="mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="sparkles" size={15} color={colors.brand[600]} />
            <Text variant="bodyStrong" className="flex-1">
              {WELCOME_REFLECTION_TITLE}
            </Text>
            <View ref={menuButton} collapsable={false}>
              <Pressable
                onPress={openMenu}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Welcome reflection options"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors['ink-soft']} />
              </Pressable>
            </View>
          </View>

          {text ? (
            <Text variant="entry" numberOfLines={3} className="mt-3 text-ink-soft">
              {text}
            </Text>
          ) : failed ? (
            <View className="mt-3 flex-row items-center gap-3">
              <Text variant="bodyMuted">Failed to load</Text>
              <Text
                variant="link"
                accessibilityRole="button"
                onPress={() => {
                  if (!retry.isPending) retry.mutate();
                }}
              >
                Try again
              </Text>
            </View>
          ) : (
            <Text variant="bodyMuted" className="mt-3">
              Writing your reflection...
            </Text>
          )}
        </Card>
      </Pressable>

      <CardMenu
        open={menuOpen}
        anchorTop={menuTop}
        onClose={() => setMenuOpen(false)}
        onDelete={onDelete}
      />
      {text ? <FullReflection text={text} visible={reading} onClose={() => setReading(false)} /> : null}
    </>
  );
}
