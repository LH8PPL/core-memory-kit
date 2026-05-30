import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,ts}'],
    testTimeout: 10_000,
    reporters: 'default',
    coverage: {
      provider: 'v8',
      // Cover the kit's actual source. Exclude thin bin wrappers (spawn-tested,
      // not unit-covered), dev tooling, fixtures, and generated/runtime dirs.
      include: ['packages/cli/src/**', 'packages/canonicalize/src/**'],
      exclude: [
        '**/node_modules/**',
        '**/bin/**',
        'scripts/**',
        'tests/**',
        'fixtures/**',
        '**/*.config.{js,mjs,ts}',
      ],
      reporter: ['text-summary', 'text', 'lcov'],
      // Thresholds are a RATCHET, not a wall: set just below current coverage
      // so the bar can't silently regress, and raise it as coverage improves.
      // (Numbers from the first measured run — Task 54.)
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
