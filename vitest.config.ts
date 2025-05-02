import { defineConfig } from 'vitest/config';

const shouldRunTests = process.env.CI !== 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: shouldRunTests ? [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.tsx'
    ] : [],
    exclude: ['src/tests/**'],
  },
  css: {
    postcss: {}
  }
});
