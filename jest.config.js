/** Jest config (jest-expo preset). Path aliases mirror tsconfig.json. */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // The Supabase client (imported transitively by component tests) registers an
  // import-time auth-refresh timer/AppState listener with no teardown hook; force a
  // clean exit so the suite doesn't hang on that benign open handle.
  forceExit: true,
  // Under full-suite load on a small machine (4 threads, 8 GB) a worker can stall for many seconds:
  // a test of a few mocked calls took 18.8 s, and the crisis-sheet test hit Jest's 5 s default
  // twice (it takes about 0.4 s alone). Allow 60 s per test; a test that really hangs still fails.
  testTimeout: 60_000,
  // Integration tests run on node:test (real DB) — keep them out of the jest run.
  testPathIgnorePatterns: ['/node_modules/', '/scripts/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@components$': '<rootDir>/src/components',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@theme$': '<rootDir>/src/theme',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@lib$': '<rootDir>/src/lib',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@app-types/(.*)$': '<rootDir>/src/types/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts', '!src/types/**'],
};
