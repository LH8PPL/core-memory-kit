import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,ts}'],
    testTimeout: 10_000,
    reporters: 'default',
  },
});
