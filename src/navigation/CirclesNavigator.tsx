import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme';
import type { CirclesStackParamList } from './types';
import {
  MyCirclesScreen,
  CreateCircleScreen,
  CircleDetailScreen,
  CircleNotificationsScreen,
  EditCircleScreen,
  InviteScreen,
  JoinCircleScreen,
  VerifyEmailToJoinScreen,
  CircleFeedScreen,
  PostThreadScreen,
  DiscoveryScreen,
} from '@features/circles';

const Stack = createNativeStackNavigator<CirclesStackParamList>();

export function CirclesNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MyCircles" component={MyCirclesScreen} />
      <Stack.Screen name="CreateCircle" component={CreateCircleScreen} />
      <Stack.Screen name="CircleDetail" component={CircleDetailScreen} />
      <Stack.Screen name="CircleNotifications" component={CircleNotificationsScreen} />
      <Stack.Screen name="EditCircle" component={EditCircleScreen} />
      <Stack.Screen name="Invite" component={InviteScreen} />
      <Stack.Screen name="JoinCircle" component={JoinCircleScreen} />
      <Stack.Screen name="VerifyEmailToJoin" component={VerifyEmailToJoinScreen} />
      <Stack.Screen name="CircleFeed" component={CircleFeedScreen} />
      <Stack.Screen name="PostThread" component={PostThreadScreen} />
      <Stack.Screen name="Discover" component={DiscoveryScreen} />
    </Stack.Navigator>
  );
}
