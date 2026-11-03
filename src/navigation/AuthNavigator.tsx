import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import { LoginScreen, SignUpScreen, ForgotPasswordScreen } from '@features/auth';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// ResetPassword is presented at the ROOT level during recovery (see RootNavigator),
// not inside this stack.
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
