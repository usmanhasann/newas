/**
 * TextField — modern form input: clean white fill, soft hairline border that becomes
 * a brand focus ring, sentence-case label, and an inline icon for validation errors.
 * RHF-friendly via forwardRef; pair with a Controller in screens. API unchanged.
 */
import { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Typography';
import { cn } from '@utils/cn';
import { colors } from '@theme';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, containerClassName, secureTextEntry, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  // Any password field (secureTextEntry) gets a show/hide "eye" toggle.
  const [reveal, setReveal] = useState(false);
  const hasError = !!error;
  const isPassword = !!secureTextEntry;

  return (
    <View className={cn('w-full', containerClassName)}>
      {label ? (
        <Text variant="label" className="mb-2">
          {label}
        </Text>
      ) : null}

      <View>
        <TextInput
          ref={ref}
          secureTextEntry={isPassword && !reveal}
          placeholderTextColor={colors['ink-faint']}
          className={cn(
            'rounded-md bg-surface px-4 py-3.5 font-sans text-base text-ink',
            isPassword && 'pr-12',
            hasError
              ? 'border-2 border-danger'
              : focused
                ? 'border-2 border-brand-500'
                : 'border border-line',
          )}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            hitSlop={8}
            className="absolute inset-y-0 right-1 w-11 items-center justify-center"
          >
            <Ionicons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors['ink-soft']}
            />
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="alert-circle" size={14} color={colors['danger-strong']} />
          <Text variant="caption" className="text-danger-strong">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" className="mt-2">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
