/**
 * LYSM — Design Tokens (SINGLE SOURCE OF TRUTH)
 * ------------------------------------------------------
 * Build prompt §4/§7: every visual value in the app comes from here.
 * NO hard-coded colors / fonts / spacing anywhere else in the codebase.
 *
 * Consumed by:
 *   - tailwind.config.js  (NativeWind utility classes: bg-brand-500, p-4, rounded-lg ...)
 *   - src/theme/*.ts      (typed theme object, useTheme(), typography components)
 *   - supabase/seed/*     (mood colors mirrored into the DB for server/widget use)
 *
 * Derived from design_and_spec/inner_circle_design_specifications.pdf.
 * That doc is a written audit (approximate "colors observed" + recommendations, no comps),
 * so gaps are filled with best-judgment design per explicit client latitude
 * (see memory: inner-circle-design-decisions). Values marked INVENTED are pending sign-off.
 *
 * This file is CommonJS (.cjs) on purpose: tailwind.config.js requires it directly,
 * and src/theme/tokens.ts re-exports it with full TypeScript types.
 */

// Raw brand purple ramp. Spec brand ≈ #7B2FBE (vivid violet); #6B21A8 = deep purple on
// Insights card; #8B5CF6 = the calmer secondary violet the spec recommends.
const brand = {
  50: '#F5EDFB',
  100: '#E9DAF7',
  200: '#D3B5EF',
  300: '#BC8FE6',
  400: '#9B6DDF',
  500: '#7B2FBE', // PRIMARY brand purple
  600: '#6B21A8', // deep purple (Insights card)
  700: '#57197F',
  800: '#3F1259',
  900: '#2A0C3B',
};

/**
 * Mood palette — INVENTED per client latitude (spec only specified Calm = mint green).
 * Each mood: `dot` (saturated indicator), `bg` (pastel pill fill), `ink` (pill label, AA on bg).
 * `frustrated` is required by master_spec and intentionally distinct from `angry`.
 * Pending user sign-off.
 */
const mood = {
  happy: '#F2B705',
  'happy-bg': '#FCEFC2',
  'happy-ink': '#7A5E00',

  calm: '#4FB286', // spec: mint green
  'calm-bg': '#B2E8C4',
  'calm-ink': '#1E6B4A',

  grateful: '#2FA39A',
  'grateful-bg': '#BFE9E4',
  'grateful-ink': '#11574F',

  content: '#7FA86B',
  'content-bg': '#D9E9C8',
  'content-ink': '#3F5C2C',

  sad: '#5B8DEF',
  'sad-bg': '#CBDBF7',
  'sad-ink': '#2B4F8F',

  anxious: '#E08A3C',
  'anxious-bg': '#F7DFC4',
  'anxious-ink': '#7C4513',

  angry: '#E5564E',
  'angry-bg': '#F7C9C6',
  'angry-ink': '#8E2A24',

  frustrated: '#D9663F', // required mood; distinct from angry
  'frustrated-bg': '#F4D2C2',
  'frustrated-ink': '#7E3417',

  tired: '#7E7AA8',
  'tired-bg': '#DAD8EC',
  'tired-ink': '#403C6B',

  neutral: '#9AA0A6',
  'neutral-bg': '#E6E8EB',
  'neutral-ink': '#50565C',
};

const colors = {
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',

  brand,
  // Calmer secondary violet recommended by the spec for secondary elements.
  violet: '#8B5CF6',
  // Primary-light lavender/lilac (mood dots, secondary accents).
  lilac: '#C9A9E8',

  // Surfaces
  background: '#F8F5F2', // warm blush global background (cleaner, lighter)
  surface: '#FFFFFF', // cards
  'surface-muted': '#F4EFEA', // light blush (secondary surfaces, subtle fills)
  'surface-sunken': '#EFE9E3', // recessed wells (chart tracks, progress tracks)
  overlay: 'rgba(20, 20, 30, 0.55)', // modal scrim (INVENTED)
  // Lighter scrim for a half-screen sheet: the screen above stays readable, "slightly dimmed"
  // (crisis resources sheet, client 10/14 p.31).
  'overlay-soft': 'rgba(20, 20, 30, 0.3)',

  // Text / ink (refined for stronger, more readable hierarchy)
  ink: '#1A1A2E', // primary dark charcoal
  'ink-soft': '#6C6C7A', // secondary gray (timestamps, subtitles) — better contrast
  // Dark gray between ink and ink-soft: the streak popup's "DAY STREAK" label (client screenshot
  // 10/14 p.24, sampled; additive only).
  'ink-muted': '#4A4658',
  'ink-faint': '#9B9BA8', // tertiary (placeholders, hints)
  'ink-inverse': '#FFFFFF',

  // Lines / borders (soft hairlines)
  line: '#E9E3DD', // subtle warm gray border
  'line-strong': '#D9D1C9',

  // Accents (onboarding icons / AI gradient endpoints)
  'accent-pink': '#E472A0', // AI gradient end
  'accent-teal': '#7ECFBA',
  'accent-rose': '#F4A4B2',

  // Bubble-parity outline (build task §3): the "required purple" for the Home
  // "Today's Mood" card chips. Intentionally a distinct, more muted purple than the
  // brand (#7B2FBE) — applied ONLY to that card per the explicit task requirement
  // (#673AB6). Documented as an assumption (see completion report).
  'mood-outline': '#673AB6',

  // Semantic
  success: '#2FB37A',
  'success-bg': '#B2E8C4', // spec permission tag (Mood)
  danger: '#F08080', // spec coral delete
  'danger-strong': '#D14343',
  warning: '#E6A700',
  'warning-bg': '#F7E6B8',
  info: '#5B8DEF',
  'summaries-bg': '#F4C6CE', // spec permission tag (Summaries)

  // Home streak flame (Today's Mood header). Warm orange per the 2026-09-15 client mockup; the
  // urgent state (8pm, today not journaled) escalates the flame + count to `danger-strong` (red).
  streak: '#E8862E',

  // Google's official "G" mark colours (brand-mandated — do not restyle). Sign-in button only.
  google: {
    blue: '#4285F4',
    green: '#34A853',
    yellow: '#FBBC05',
    red: '#EA4335',
  },

  // Circles tab, YOUR CIRCLES cards: the colored type icon (client mockup 2026-10-14, exact hex
  // values from the client). `bg` = the icon circle fill, `ink` = the outline globe / lock glyph.
  circle: {
    'public-bg': '#B9E8CB',
    'public-ink': '#1F5C3C',
    'private-bg': '#EADBF8',
    'private-ink': '#5A1F9A',
  },

  mood,
};

// Spacing scale — Tailwind-style numeric keys mapping to px.
// Spec's emphasized scale is the 1/2/4/6/8/12 subset (4/8/16/24/32/48). 14 = FAB (56px),
// 11 = min touch target (44px).
const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  11.5: 46, // YOUR CIRCLES card type icon circle (client 2026-10-14: about 46px; additive only)
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  22: 88, // LYSM app icon on sign-up / sign-in (client 10/14 p.31: about 90px; additive only)
  24: 96,
  28: 112, // onboarding icon badge (matches the standard scale step; additive only)
  32: 128, // larger onboarding badge / paired circles (additive only)
  36: 144, // "You're all set" check circle (client 10/14 p.11: about 145px; additive only)
  82: 328, // "Two ways to open up" speech bubbles, widest (client screenshot: ~83% of a 390pt screen; additive only)
};

// Radii — modernized: softer, slightly larger corners read as more premium.
// inputs ~14, cards ~20, buttons/pills ~26, sheets ~32.
const borderRadius = {
  none: 0,
  sm: 10, // chips, small controls
  md: 14, // inputs
  lg: 20, // cards
  xl: 24,
  '2xl': 26, // buttons / pills
  '3xl': 32, // bottom sheets / large surfaces
  full: 9999,
};

// Font families. @expo-google-fonts exposes each weight as its own family name string.
// Serif (Playfair Display) for headings/display; sans (Inter) for UI/body/forms.
const fontFamily = {
  serif: ['PlayfairDisplay_500Medium', 'serif'],
  'serif-semibold': ['PlayfairDisplay_600SemiBold', 'serif'],
  'serif-bold': ['PlayfairDisplay_700Bold', 'serif'],
  sans: ['Inter_400Regular', 'sans-serif'],
  'sans-medium': ['Inter_500Medium', 'sans-serif'],
  'sans-semibold': ['Inter_600SemiBold', 'sans-serif'],
  'sans-bold': ['Inter_700Bold', 'sans-serif'],
};

// Type scale (px) — derived from spec's observed sizes.
const fontSize = {
  xs: '12px', // timestamps / captions
  sm: '13px',
  base: '15px', // body
  md: '16px', // button labels / body emphasis
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '28px', // page headings
  '4xl': '32px', // display / app name
  '5xl': '40px',
  '6xl': '48px', // paywall price
  hero: '56px', // streak popup number (client screenshot 10/14 p.24; additive only)
  headline: '36px', // sign-up / sign-in headline (client screenshot 10/14 p.31; additive only)
};

// Letter spacing for display headings + uppercase tracked section labels.
const letterSpacing = {
  tighter: '-0.4px', // large display headings
  tight: '-0.2px',
  normal: '0px',
  wide: '0.5px',
  wider: '1px',
  label: '1.2px', // section labels
};

// Soft, layered shadows (modern = subtle elevation, never heavy). Used via the typed
// theme on style props. `subtle` for resting controls, `card` for surfaces.
const shadow = {
  subtle: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  card: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
  },
  // Soft glow mostly below a white pill on the cream background: a touch firmer than `subtle`
  // so it still reads as depth (Send Feedback category pills, client 10/14 p.12 reference image).
  pill: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  // Brand-tinted lift for the primary CTA + FAB (premium, on-brand glow).
  brand: {
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  fab: {
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  modal: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 36,
    elevation: 16,
  },
};

// AI Insight gradient (spec §5.4: purple → pink).
const gradient = {
  ai: ['#7B2FBE', '#E472A0'],
  brand: ['#7B2FBE', '#9B6DDF'],
};

// Blurred text (the paywall's locked reflection / last entry, client 10/14 p.32 + p.37). React
// Native has no cross-platform text blur, so the text is drawn as a grid of faint copies offset by
// up to `radius` px every `step` px, each at `opacity` with a soft `shadow` px glow of its own
// colour (tuned side by side with the mock: unreadable, soft like a real blur). Additive only.
const blur = {
  radius: 6,
  step: 3,
  opacity: 0.09,
  shadow: 5,
};

module.exports = {
  colors,
  spacing,
  borderRadius,
  fontFamily,
  fontSize,
  letterSpacing,
  shadow,
  gradient,
  blur,
};
