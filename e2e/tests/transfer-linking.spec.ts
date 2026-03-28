import { test, expect, type Page } from '@playwright/test';

async function selectAccountByName(page: Page, name: string) {
  await page.locator('#accountId').evaluate((select, wanted) => {
    const s = select as HTMLSelectElement;
    for (let i = 0; i < s.options.length; i++) {
      if (s.options[i].text.trim() === wanted) {
        s.selectedIndex = i;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    throw new Error(`No account option: ${wanted}`);
  }, name);
}

test.describe('Transfer Linking', () => {
  // Create two accounts and matching transfer transactions, then test linking/unlinking

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // Create Account A
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Add account' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input[name="name"]').fill('Transfer Test A');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await page.waitForSelector('text=Transfer Test A');

    // Create Account B
    await page.getByRole('button', { name: 'Add account' }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input[name="name"]').fill('Transfer Test B');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await page.waitForSelector('text=Transfer Test B');

    // Add manual transaction on Account A (debit -100)
    await page.goto('/transactions/new');
    await selectAccountByName(page, 'Transfer Test A');
    await page.locator('input[name="date"]').fill('2024-06-15');
    await page.locator('input[name="description"]').fill('Transfer to B');
    await page.locator('input[name="amount"]').fill('-100');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await page.waitForURL('/transactions');

    // Add manual transaction on Account B (credit +100)
    await page.goto('/transactions/new');
    await selectAccountByName(page, 'Transfer Test B');
    await page.locator('input[name="date"]').fill('2024-06-15');
    await page.locator('input[name="description"]').fill('Transfer from A');
    await page.locator('input[name="amount"]').fill('100');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await page.waitForURL('/transactions');

    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Delete both test accounts (cascades transactions)
    await page.goto('/accounts');
    for (const name of ['Transfer Test A', 'Transfer Test B']) {
      await page.waitForSelector(`text=${name}`);
      await page.locator('button:has(.lucide-trash-2)').first().click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    }
    await page.close();
  });

  test('categorise both transactions as Transfer', async ({ page }) => {
    await page.goto('/transactions');

    // Categorise "Transfer to B"
    const toB = page.locator('tr').filter({ hasText: 'Transfer to B' });
    await toB.locator('button, span').filter({ hasText: /Uncategorised/i }).click();
    await page.getByRole('option', { name: 'Transfer' }).first().click();

    // Categorise "Transfer from A"
    const fromA = page.locator('tr').filter({ hasText: 'Transfer from A' });
    await fromA.locator('button, span').filter({ hasText: /Uncategorised/i }).click();
    await page.getByRole('option', { name: 'Transfer' }).first().click();
  });

  test('Link button appears on transfer transactions', async ({ page }) => {
    await page.goto('/transactions');
    const toB = page.locator('tr').filter({ hasText: 'Transfer to B' });
    await expect(toB.locator('button', { hasText: 'Link' })).toBeVisible();
  });

  test('link transfer and verify Linked badge', async ({ page }) => {
    await page.goto('/transactions');

    const toB = page.locator('tr').filter({ hasText: 'Transfer to B' });
    await toB.locator('button', { hasText: 'Link' }).click();

    // Wait for candidates to load
    const popover = page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').last();
    await expect(popover.getByText('Transfer from A')).toBeVisible({ timeout: 5000 });

    // Click the candidate
    await popover.locator('button').filter({ hasText: 'Transfer from A' }).click();

    // Both rows should now show "Linked"
    await expect(toB.locator('button', { hasText: 'Linked' })).toBeVisible({ timeout: 5000 });
    const fromA = page.locator('tr').filter({ hasText: 'Transfer from A' });
    await expect(fromA.locator('button', { hasText: 'Linked' })).toBeVisible();
  });

  test('unlink transfer', async ({ page }) => {
    await page.goto('/transactions');

    const toB = page.locator('tr').filter({ hasText: 'Transfer to B' });
    await toB.locator('button', { hasText: 'Linked' }).click();

    const popover = page.locator('[data-radix-popper-content-wrapper]').last();
    await popover.getByRole('button', { name: 'Unlink' }).click();

    // "Link" button should reappear
    await expect(toB.locator('button', { hasText: 'Link' })).toBeVisible({ timeout: 5000 });
  });
});
