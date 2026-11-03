/**
 * Auth form schemas (Zod). Shared by React Hook Form on the client; the same
 * shapes are re-validated server-side in Edge Functions where applicable
 * (build prompt §6 — never trust the client).
 */
import { z } from 'zod';
import { displayNameSchema } from '@utils/nameSymbols';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

// 8+ chars; surfaced as the password hint under the field (design spec §6.2). At most 72 bytes:
// the auth server's hash (bcrypt) reads no further, and the Edge Functions refuse longer ones.
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Use a shorter password');

/** The 6-digit code from a LYSM email (verification, change email, password reset). */
export const oneTimeCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const signupSchema = z.object({
  // Required, and no check marks (client 10/14 p.5: "This applies when creating an account").
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  // Optional invite code that links the new user to the inviting circle (redeemed
  // in Phase 3). Normalised to upper-case, dashes/spaces stripped.
  inviteCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .optional()
    .or(z.literal('')),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
