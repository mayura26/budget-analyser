import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('page title renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('month subtitle visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/\w+ \d{4}/)).toBeVisible();
  });

  test('four summary cards present', async ({ page }) => {
    await page.goto('/dashboard');
    for (const label of ['Income', 'Expenses', 'Net', 'Transactions']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('currency-formatted values in income card', async ({ page }) => {
    await page.goto('/dashboard');
    // Income card shows a formatted currency value (even if $0.00)
    const incomeCard = page.locator('.rounded-lg').filter({ hasText: 'Income' }).first();
    await expect(incomeCard.getByText(/\$[\d,.]+/)).toBeVisible();
  });

  test('charts section renders', async ({ page }) => {
    await page.goto('/dashboard');
    // DashboardCharts is a client component — wait for hydration
    await expect(page.getByText(/monthly overview/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
