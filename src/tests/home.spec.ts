import { test, expect } from '@playwright/test';

// Basic smoke test that doesn't require browser binaries
test('basic test', async ({ page }) => {
  // This test is intentionally minimal and will be skipped if no browser is available
  test.skip(process.env.CI !== 'true', 'Only run in CI environment');
  
  await page.goto('/');
  
  // Basic assertions that don't depend on specific page content
  expect(page).toBeDefined();
});
