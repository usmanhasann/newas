/**
 * CodeField: the 6-digit email code input (Sign-in & Security, client revisions 10/14 p.18-20).
 * A TextField tuned for one-time codes: number pad, the phone's "from Messages / Mail" autofill
 * (oneTimeCode / one-time-code), digits only, at most six (a pasted "123 456" still fits).
 */
import { TextField, type TextFieldProps } from './TextField';

export const CODE_LENGTH = 6;

export interface CodeFieldProps extends Omit<
  TextFieldProps,
  'value' | 'onChangeText' | 'keyboardType' | 'maxLength'
> {
  value: string;
  /** Receives only the digits (pasting "123 456" gives "123456"). */
  onChangeText: (digits: string) => void;
}

export function CodeField({
  value,
  onChangeText,
  label = 'Code',
  ...rest
}: CodeFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={CODE_LENGTH + 1}
      placeholder="123456"
      accessibilityLabel="6-digit code"
      {...rest}
    />
  );
}
