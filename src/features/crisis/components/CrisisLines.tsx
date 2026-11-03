import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@components';
import { colors } from '@theme';

/**
 * The 988 Suicide & Crisis Lifeline and Crisis Text Line options, each with its call/text actions.
 * One source for the crisis resources pop-up (CrisisResourcesSheet) and the message shown where a
 * flagged entry's reflection would be (CrisisSupportMessage), so both always offer the same help.
 */
export function CrisisLines() {
  const openTel = (n: string) => Linking.openURL(`tel:${n}`);
  const openSms = (n: string) => Linking.openURL(`sms:${n}`);

  return (
    <>
      {/* 988 Suicide & Crisis Lifeline */}
      <Card>
        <View className="flex-row items-center gap-3">
          <ResourceIcon name="call" bg={colors.brand[50]} tint={colors.brand[500]} />
          <Text variant="h3" className="flex-1">
            988 Suicide &amp; Crisis Lifeline
          </Text>
        </View>
        <Text variant="bodyMuted" className="mt-3">
          Free, confidential support 24/7. Call or text 988.
        </Text>
        <View className="mt-4 flex-row gap-3">
          <Button title="Call 988" size="sm" fullWidth={false} onPress={() => openTel('988')} />
          <Button
            title="Text 988"
            variant="outline"
            size="sm"
            fullWidth={false}
            onPress={() => openSms('988')}
          />
        </View>
      </Card>

      {/* Crisis Text Line */}
      <Card>
        <View className="flex-row items-center gap-3">
          <ResourceIcon
            name="chatbubble-ellipses"
            bg={colors['success-bg']}
            tint={colors.success}
          />
          <Text variant="h3" className="flex-1">
            Crisis Text Line
          </Text>
        </View>
        <Text variant="bodyMuted" className="mt-3">
          Free, confidential text support 24/7.
        </Text>
        <View className="mt-4 flex-row">
          <Button
            title="Text HOME to 741741"
            variant="outline"
            size="sm"
            fullWidth={false}
            onPress={() => openSms('741741')}
          />
        </View>
      </Card>
    </>
  );
}

export function ResourceIcon({
  name,
  bg,
  tint,
}: {
  name: keyof typeof Ionicons.glyphMap;
  bg: string;
  tint: string;
}) {
  return (
    <View
      className="h-11 w-11 items-center justify-center rounded-full"
      style={{ backgroundColor: bg }}
    >
      <Ionicons name={name} size={22} color={tint} />
    </View>
  );
}
