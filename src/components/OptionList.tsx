/**
 * Accessible option list. Two modes, one look:
 *  - SINGLE (default): a radio group — tapping a row selects it (and only it).
 *  - MULTI (`multi`): a checkbox group — tap to toggle; once `maxSelections` are chosen, the
 *    remaining unselected rows dim and stop responding (you must deselect one to swap).
 * Each row is a tappable card that lifts subtly and fills with a brand tint + check when
 * selected. Token-driven.
 */
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Typography';
import { colors, shadow } from '@theme';
import { cn } from '@utils/cn';

/** Any Ionicons glyph name — used for the optional leading logo/icon on a row. */
export type OptionIconName = keyof typeof Ionicons.glyphMap;

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon (e.g. a source logo on the acquisition step). */
  icon?: OptionIconName;
  /** Optional supporting line under the label. */
  description?: string;
}

interface OptionListBaseProps<T extends string> {
  options: OptionItem<T>[];
  className?: string;
  /**
   * Render each row's icon inside a round badge instead of bare. Opt-in because the rows that
   * show brand logos (the acquisition step) are meant to sit flush against the label — only
   * pictogram rows like the tried-apps thumbs want the badge treatment.
   */
  iconBadge?: boolean;
}

/** Single-select (radio) — the default; unchanged API. */
export interface SingleSelectProps<T extends string> extends OptionListBaseProps<T> {
  multi?: false;
  value: T | null | undefined;
  onChange: (value: T) => void;
}

/** Multi-select (checkbox) — toggle up to `maxSelections`. */
export interface MultiSelectProps<T extends string> extends OptionListBaseProps<T> {
  multi: true;
  values: T[];
  onToggle: (value: T) => void;
  /** Cap on selections; unselected rows disable once reached. Defaults to unlimited. */
  maxSelections?: number;
}

export type OptionListProps<T extends string> = SingleSelectProps<T> | MultiSelectProps<T>;

export function OptionList<T extends string>(props: OptionListProps<T>) {
  const { options, className, iconBadge = false } = props;
  const isMulti = props.multi === true;
  const max = isMulti ? (props.maxSelections ?? Infinity) : Infinity;
  const selectedCount = isMulti ? props.values.length : 0;

  const isSelected = (v: T): boolean =>
    props.multi ? props.values.includes(v) : props.value === v;

  const press = (v: T) => {
    if (props.multi) props.onToggle(v);
    else props.onChange(v);
  };

  return (
    <View className={cn('gap-3', className)} accessibilityRole={isMulti ? undefined : 'radiogroup'}>
      {options.map((opt) => {
        const selected = isSelected(opt.value);
        // At the cap, unselected rows are locked (you can still deselect a chosen one to swap).
        const locked = isMulti && !selected && selectedCount >= max;
        return (
          <Pressable
            key={opt.value}
            onPress={() => press(opt.value)}
            disabled={locked}
            accessibilityRole={isMulti ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: selected, selected, disabled: locked }}
            accessibilityLabel={opt.label}
            style={shadow.subtle}
            className={cn(
              'flex-row items-center justify-between rounded-2xl px-4 py-4 active:opacity-90',
              selected ? 'border-2 border-brand-500 bg-brand-50' : 'border border-line bg-surface',
              locked && 'opacity-40',
            )}
          >
            <View className="flex-1 flex-row items-center gap-3 pr-3">
              {opt.icon ? (
                iconBadge ? (
                  // White disc so the pictogram reads as its own element. The hairline keeps it
                  // visible on an unselected (white) row, where a pure white disc would vanish.
                  <View className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface">
                    <Ionicons name={opt.icon} size={20} color={colors.ink} />
                  </View>
                ) : (
                  <Ionicons name={opt.icon} size={22} color={colors.ink} />
                )
              ) : null}
              <View className="flex-1">
                <Text
                  variant="body"
                  className={cn(selected ? 'font-sans-semibold text-ink' : 'text-ink')}
                >
                  {opt.label}
                </Text>
                {opt.description ? (
                  <Text variant="caption" className="mt-0.5">
                    {opt.description}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Round indicator for BOTH modes (radio + multi-select). Multi rows keep the
                checkbox a11y role; only the visual is a filled circle + check. */}
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={selected ? colors.brand[500] : colors['ink-faint']}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
