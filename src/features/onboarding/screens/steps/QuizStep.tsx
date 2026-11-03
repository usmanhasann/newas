/**
 * Generic quiz step. Two shapes:
 *  - SINGLE (default): pick exactly one; persists a scalar (e.g. acquisition_source).
 *  - MULTI (`multi`): pick between `minSelections` and `maxSelections` (default 1–2); persists
 *    an array. Used by the "real" questions where the user may choose up to two answers.
 * Continue stays disabled until the minimum is met (§5/§20 — validate before navigating).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, OptionList } from '@components';
import { StepScaffold } from '../../components/StepScaffold';
import { trackOnboarding } from '../../analytics';
import type { Option } from '../../constants';
import type { OnboardingData } from '../../types';
import type { OnboardingNav } from '../../hooks';

export interface QuizStepProps<T extends string> {
  nav: OnboardingNav;
  screen: string;
  title: string;
  options: Option<T>[];
  valueKey: keyof OnboardingData;
  lastQuiz?: boolean;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Allow choosing more than one answer (persists an array). */
  multi?: boolean;
  /** Max answers in multi mode (default 2). */
  maxSelections?: number;
  /** Min answers required in multi mode (default 1). */
  minSelections?: number;
  /** Preselect this option (single mode) when the user hasn't chosen yet. */
  defaultValue?: T;
  /** Preselect these options (multi mode) when the user hasn't chosen yet. */
  defaultValues?: T[];
  /** Optional small print rendered above the Continue button (e.g. a crisis-resources note). */
  disclaimer?: ReactNode;
}

export function QuizStep<T extends string>({
  nav,
  screen,
  title,
  options,
  valueKey,
  lastQuiz,
  subtitle,
  multi = false,
  maxSelections = 2,
  minSelections = 1,
  defaultValue,
  defaultValues,
  disclaimer,
}: QuizStepProps<T>) {
  // One internal shape (an array) for both modes — single-select just holds 0 or 1 item.
  const raw = nav.data[valueKey];
  const initial: T[] = Array.isArray(raw)
    ? (raw as T[])
    : raw != null
      ? [raw as T]
      : multi
        ? (defaultValues ?? [])
        : defaultValue != null
          ? [defaultValue]
          : [];
  const [selected, setSelected] = useState<T[]>(initial);

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed-key patches: TS can't relate `valueKey` to T, so cast these small patches.
  const selectOne = (v: T) => {
    setSelected([v]);
    nav.patchLocal({ [valueKey]: v } as OnboardingData);
    trackOnboarding('quiz_answer_selected', { screen });
  };

  const toggle = (v: T) => {
    const has = selected.includes(v);
    const next = has
      ? selected.filter((x) => x !== v)
      : selected.length < maxSelections
        ? [...selected, v]
        : selected; // at the cap — no change (OptionList also locks the row)
    if (next === selected) return;
    setSelected(next);
    nav.patchLocal({ [valueKey]: next } as OnboardingData);
    trackOnboarding('quiz_answer_selected', { screen });
  };

  const enough = multi ? selected.length >= minSelections : selected.length >= 1;

  const onContinue = async () => {
    if (!enough) return;
    if (lastQuiz) trackOnboarding('quiz_completed');
    const patch = (multi ? { [valueKey]: selected } : { [valueKey]: selected[0] }) as OnboardingData;
    await nav.goNext(patch);
  };

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      title={title}
      subtitle={subtitle}
      footer={
        <View>
          {disclaimer ? <View className="mb-4">{disclaimer}</View> : null}
          <Button title="Continue" disabled={!enough} loading={nav.saving} onPress={onContinue} />
        </View>
      }
    >
      {multi ? (
        <OptionList
          multi
          options={options}
          values={selected}
          onToggle={toggle}
          maxSelections={maxSelections}
        />
      ) : (
        <OptionList options={options} value={selected[0] ?? null} onChange={selectOne} />
      )}
    </StepScaffold>
  );
}
