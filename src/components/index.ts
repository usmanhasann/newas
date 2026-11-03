/**
 * Shared UI primitives. Import from '@components'. Every primitive is token-driven
 * (no hard-coded colors/fonts/spacing) so the whole app renders from the design tokens.
 */
export { Text } from './Typography';
export type { TextProps, TextVariant } from './Typography';
export { Screen } from './Screen';
export type { ScreenProps } from './Screen';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export { MoodDot, MoodPill, MoodPillGroup } from './Mood';
export type { MoodDotProps, MoodPillProps, MoodPillGroupProps } from './Mood';
export { ControlledTextField } from './form/ControlledTextField';
export { CodeField, CODE_LENGTH } from './CodeField';
export type { CodeFieldProps } from './CodeField';
export { LoadingScreen } from './LoadingScreen';
export { BrandSplash } from './BrandSplash';
export { Placeholder } from './Placeholder';
export { ErrorBoundary } from './ErrorBoundary';
export { Toast } from './Toast';
export { MoodSelector } from './MoodSelector';
export type { MoodSelectorProps } from './MoodSelector';
export { AIInsightCard } from './AIInsightCard';
export { Fab } from './Fab';
export { Avatar } from './Avatar';
export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';
export { OptionList } from './OptionList';
export { AppIconTile, AuthHero, AuthProviderButtons, LegalNotice } from './SocialAuth';
export type { AuthProviderId } from './SocialAuth';
export type { OptionItem, OptionListProps, OptionIconName } from './OptionList';
export { VerifiedBadge } from './VerifiedBadge';
export type { VerifiedBadgeSize } from './VerifiedBadge';
