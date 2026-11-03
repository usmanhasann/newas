const tokens = require('./src/theme/tokens.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Token-driven: the theme is generated entirely from src/theme/tokens.cjs.
  content: ['./App.tsx', './index.ts', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens.colors,
      spacing: tokens.spacing,
      borderRadius: tokens.borderRadius,
      fontFamily: tokens.fontFamily,
      fontSize: tokens.fontSize,
      letterSpacing: tokens.letterSpacing,
    },
  },
  plugins: [],
};
