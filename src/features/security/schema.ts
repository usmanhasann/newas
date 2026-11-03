/**
 * Sign-in & Security form schemas (Zod). The Edge Functions validate everything again.
 */
import { z } from 'zod';
import { emailSchema, passwordSchema } from '@features/auth';

const currentPassword = z.string().min(1, 'Enter your current password');

/** Change email on an account with a password: the current password comes first (p.19). */
export const changeEmailSchema = z.object({ currentPassword, newEmail: emailSchema });

/** Replace an Apple relay address (no password: Sign in with Apple confirms it instead, p.21). */
export const relayEmailSchema = z.object({ newEmail: emailSchema });

export const changePasswordSchema = z
  .object({
    currentPassword,
    password: passwordSchema,
    confirm: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
