/**
 * React Hook Form ↔ TextField bridge. Removes Controller boilerplate in every form
 * and wires validation errors straight into the field's error slot.
 */
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { TextField, type TextFieldProps } from '../TextField';

type Props<T extends FieldValues> = Omit<
  TextFieldProps,
  'value' | 'onChangeText' | 'onBlur' | 'error'
> & {
  control: Control<T>;
  name: Path<T>;
};

export function ControlledTextField<T extends FieldValues>({
  control,
  name,
  ...rest
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          value={(field.value as string | undefined) ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}
