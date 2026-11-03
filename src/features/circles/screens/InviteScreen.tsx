/**
 * Invite screen — Bubble "Invite a loved one" parity, wired to the EXISTING invite
 * functionality (no new SMS backend):
 *   • Nickname → personalizes the email + is stored on the invite.
 *   • Email | Phone toggle → Email uses the existing send-invite (emails the join
 *     code); Phone opens the device SMS composer pre-filled with the code.
 * The invite-code card (copy/share) is kept as a secondary option.
 */
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Screen, Text, TextField } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import type { CirclesStackParamList } from '@/navigation/types';
import { useCircle, useInviteByEmail } from '../hooks';

type Props = NativeStackScreenProps<CirclesStackParamList, 'Invite'>;
type Method = 'email' | 'phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteScreen({ navigation, route }: Props) {
  const { circleId } = route.params;
  const { data: circle } = useCircle(circleId);
  const invite = useInviteByEmail();

  const [name, setName] = useState('');
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  const code = circle?.invite_code ?? '';
  const codeMessage = `Join${circle ? ` "${circle.name}"` : ''} on LYSM. Use invite code: ${code}`;

  const emailValid = EMAIL_RE.test(email.trim());
  const phoneValid = phone.replace(/\D/g, '').length >= 5;
  const canSend = method === 'email' ? emailValid : phoneValid;

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    toast.success('Invite code copied.');
  };

  const shareCode = () => Share.share({ message: codeMessage });

  const sendSms = () => {
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const num = phone.replace(/[^\d+]/g, '');
    Linking.openURL(`sms:${num}${sep}body=${encodeURIComponent(codeMessage)}`).catch(() =>
      toast.error('Couldn’t open Messages. Share the code instead.'),
    );
  };

  const onSend = async () => {
    if (!canSend) return;
    if (method === 'phone') {
      sendSms();
      return;
    }
    setStatus('idle');
    try {
      await invite.mutateAsync({
        circleId,
        email,
        name: name.trim() || null,
      });
      setStatus('sent');
      setEmail('');
      setName('');
      toast.success('Invitation sent.');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Screen scroll keyboardAvoiding>
      <View className="flex-row items-center py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-500">
          <Ionicons name="heart" size={28} color={colors.white} />
        </View>
        <Text variant="h2" className="mt-4 text-center">
          Invite a loved one
        </Text>
        <Text variant="bodyMuted" className="mt-2 text-center">
          {circle?.type === 'public'
            ? 'They’ll be able to read your prompts and join the conversation.'
            : 'They’ll be able to see your mood summaries and support you on your journey.'}
        </Text>
      </View>

      <Text variant="section" className="mb-2 mt-8">
        Nickname
      </Text>
      <TextField value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />

      <View className="mt-5 flex-row self-start rounded-full bg-surface-muted p-1">
        {(['email', 'phone'] as const).map((m) => {
          const active = method === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={cn('rounded-full px-6 py-2', active && 'bg-brand-500')}
            >
              <Text variant="bodyStrong" className={active ? 'text-ink-inverse' : 'text-ink-soft'}>
                {m === 'email' ? 'Email' : 'Phone'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="section" className="mb-2 mt-5">
        {method === 'email' ? 'Their email' : 'Their phone'}
      </Text>
      {method === 'email' ? (
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          hint={
            status === 'sent'
              ? 'Invitation sent!'
              : status === 'error'
                ? 'Couldn’t send right now. Share the code below instead.'
                : 'We’ll email them the invite code.'
          }
        />
      ) : (
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          keyboardType="phone-pad"
          hint="Opens Messages with the invite code ready to send."
        />
      )}

      <Button
        title="Send Invitation"
        className="mt-6"
        disabled={!canSend || invite.isPending}
        loading={method === 'email' && invite.isPending}
        onPress={onSend}
      />

      <Text variant="section" className="mb-2 mt-8">
        Or share an invite code
      </Text>
      <Card>
        {/* selectable → native press-and-hold "Copy" (iOS) / text selection (Android). */}
        <Text variant="bodyStrong" selectable={!!code} className="text-2xl tracking-wider">
          {code || '\u00A0'}
        </Text>
        <Text variant="caption" className="mt-2">
          {circle?.type === 'public'
            ? 'Anyone can join this circle by entering this code under “Discover circles” in the Circles tab.'
            : 'Anyone with this code can ask to join under “Discover circles” in the Circles tab. You approve who gets in.'}
        </Text>
        <View className="mt-4 flex-row gap-3">
          <Button
            title="Copy"
            variant="outline"
            fullWidth={false}
            className="flex-1"
            onPress={copyCode}
            disabled={!code}
            leftIcon={<Ionicons name="copy-outline" size={18} color={colors.ink} />}
          />
          <Button
            title="Share"
            variant="secondary"
            fullWidth={false}
            className="flex-1"
            onPress={shareCode}
            disabled={!code}
            leftIcon={<Ionicons name="share-outline" size={18} color={colors.brand[600]} />}
          />
        </View>
      </Card>
    </Screen>
  );
}
