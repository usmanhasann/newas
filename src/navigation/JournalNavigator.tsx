import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme';
import type { JournalStackParamList } from './types';
import {
  JournalHomeScreen,
  AllEntriesScreen,
  NewEntryScreen,
  EntryDetailScreen,
} from '@features/journal';
import { NotificationsListScreen } from '@features/notifications';

const Stack = createNativeStackNavigator<JournalStackParamList>();

export function JournalNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="JournalHome" component={JournalHomeScreen} />
      <Stack.Screen name="AllEntries" component={AllEntriesScreen} />
      <Stack.Screen
        name="NewEntry"
        component={NewEntryScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="EntryDetail" component={EntryDetailScreen} />
      <Stack.Screen name="NotificationsList" component={NotificationsListScreen} />
    </Stack.Navigator>
  );
}
