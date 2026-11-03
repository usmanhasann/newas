// Flat ESLint config (ESLint 9) built on Expo's preset.
const expoFlat = require('eslint-config-expo/flat');

module.exports = [
  ...expoFlat,
  {
    ignores: [
      'node_modules/*',
      '.expo/*',
      'dist/*',
      'android/*',
      'ios/*',
      '_baseline/*',
      'supabase/functions/*',
    ],
  },
  {
    rules: {
      'import/order': 'off',
      'no-console': 'off',
    },
  },
  {
    // Jest config/setup are plain JS at the repo root (not matched by the preset's
    // test-file globs) — give them the jest + node globals they use.
    files: ['jest.setup.js', 'jest.config.js'],
    languageOptions: {
      globals: { jest: 'readonly', process: 'readonly', module: 'writable', require: 'readonly' },
    },
  },
];
