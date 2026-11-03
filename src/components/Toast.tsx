import { useEffect } from 'react';
import { View } from 'react-native';
import { useToastStore } from '@store/toast';
import { colors, shadow } from '@theme';
import { Text } from './Typography';

/** App-root toast overlay (build prompt §10 — error/success toasts). */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const type = useToastStore((s) => s.type);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3000);
    return () => clearTimeout(t);
  }, [message, hide]);

  if (!message) return null;

  const bg =
    type === 'error' ? colors['danger-strong'] : type === 'success' ? colors.success : colors.ink;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 20, right: 20, bottom: 48 }}
      className="items-center"
    >
      <View style={[{ backgroundColor: bg }, shadow.modal]} className="rounded-full px-5 py-3">
        <Text variant="bodyStrong" style={{ color: colors.white }}>
          {message}
        </Text>
      </View>
    </View>
  );
}
