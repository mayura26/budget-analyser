import { test, expect } from '@playwright/test';

test.describe('System theme detection', () => {
  test('applies dark class when system prefers dark', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await context.close();
  });

  test('does not apply dark class when system prefers light', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await context.close();
  });
});
