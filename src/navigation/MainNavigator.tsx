import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from './types';
import { colors } from '@theme';
import { InsightsScreen } from '@features/insights';
import { JournalNavigator } from './JournalNavigator';
import { CirclesNavigator } from './CirclesNavigator';
import { ProfileNavigator } from './ProfileNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();
type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Icons + labels per design spec §5.6 (labels added; active state = brand purple).
const ICONS: Record<keyof MainTabParamList, { on: IoniconName; off: IoniconName }> = {
  JournalTab: { on: 'book', off: 'book-outline' },
  InsightsTab: { on: 'stats-chart', off: 'stats-chart-outline' },
  CirclesTab: { on: 'people', off: 'people-outline' },
  ProfileTab: { on: 'person', off: 'person-outline' },
};

export function MainNavigator() {
  const insets = useSafeAreaInsets();

  return (
    // Tabs switch instantly (no cross-fade), and inactive scenes stay attached. Both settings
    // fix an intermittent BLANK tab: the bottom-tabs 'shift'/'fade' presets bind each scene's
    // opacity to an Animated.Value that is fully opaque ONLY at exactly 0 (see the library's
    // forShift/forFade interpolators). If that value gets stranded off-zero — rapid taps, a heavy
    // first mount stalling the settle, or a react-native-screens re-attach — the FOCUSED tab
    // renders transparent: a blank content area with the tab bar still showing, until you navigate
    // away and back. The default 'none' preset binds NO opacity, so that blank is structurally
    // impossible; do NOT reintroduce 'shift'/'fade' here. detachInactiveScreens={false} then keeps
    // the 4 (light) tab scenes mounted instead of letting react-native-screens detach/re-attach
    // them (its on-device default), closing the New-Architecture re-attach path that can blank a
    // tab independently of the opacity binding.
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand[500],
        tabBarInactiveTintColor: colors['ink-soft'],
        // Disable the Android ripple / lingering tap highlight; keep a subtle press
        // opacity. The active tab is conveyed by the brand tint, not a background.
        tabBarButton: (props) => (
          <PlatformPressable {...props} pressColor="transparent" pressOpacity={0.6} />
        ),
        // Grow the bar by the safe-area inset so icons/labels clear the home indicator
        // (devices without one have inset.bottom = 0, so the bar stays compact).
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          shadowColor: colors.ink,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 8,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
        tabBarIcon: ({ focused, color, size }) => {
          const set = ICONS[route.name as keyof MainTabParamList];
          return <Ionicons name={focused ? set.on : set.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="JournalTab" component={JournalNavigator} options={{ title: 'Journal' }} />
      <Tab.Screen name="InsightsTab" component={InsightsScreen} options={{ title: 'Insights' }} />
      <Tab.Screen name="CirclesTab" component={CirclesNavigator} options={{ title: 'Circles' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
