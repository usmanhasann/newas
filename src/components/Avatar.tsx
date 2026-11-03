import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme';

export function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  return (
    <View
      className="items-center justify-center overflow-hidden bg-brand-100"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.5} color={colors.brand[500]} />
      )}
    </View>
  );
}
