import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Use a minimal configuration without installing browsers
  use: {
    // Skip browser binary downloads - this prevents git push issues
    // and large repo size
    channel: 'chrome',
  },
  // Minimal setup for CI environments
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  testDir: './src/tests',
  testMatch: '**/*.spec.ts',
  // Prevent auto-installation of browsers
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
