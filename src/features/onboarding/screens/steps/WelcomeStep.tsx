/**
 * Screen 1 — Welcome. The entry split: "Get Started" continues the onboarding step machine
 * (new users, on the anonymous session); "Sign In" branches to the SignInScreen for existing
 * users (a sibling in the OnboardingFlowNavigator). No progress bar here — it's a landing/
 * branch point, not step 1 of N.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Text } from '@components';
import { IS_DEV } from '@store/devFlags';
import { useCompleteOnboarding } from '@features/profile';
import type { OnboardingFlowStackParamList } from '@/navigation/types';
import { StepScaffold } from '../../components/StepScaffold';
import { WelcomeArt } from '../../components/illustrations';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

export function WelcomeStep({ nav }: StepProps) {
  const complete = useCompleteOnboarding();
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingFlowStackParamList>>();

  useEffect(() => {
    trackOnboarding('onboarding_started');
    trackOnboarding('screen_viewed', { screen: 'welcome' });
  }, []);

  return (
    <StepScaffold
      progress={null}
      centerContent
      footer={
        <View className="gap-2">
          <Button title="Get Started" loading={nav.saving} onPress={() => nav.goNext()} />
          <Button title="Sign In" variant="ghost" onPress={() => navigation.navigate('SignIn')} />
          {IS_DEV ? (
            <Button
              title="Skip onboarding (dev)"
              variant="ghost"
              className="mt-2"
              loading={complete.isPending}
              onPress={() => complete.mutate()}
            />
          ) : null}
        </View>
      }
    >
      <View className="items-center">
        <WelcomeArt size={224} />
        <Text variant="h1" className="mt-8 text-center">
          Reflection made effortless
        </Text>
        <Text variant="bodyMuted" className="mt-3 text-center">
          Your private space to check in, notice your patterns, and feel more like yourself.
        </Text>
      </View>
    </StepScaffold>
  );
}
