import { test, expect } from '@playwright/test';
import path from 'node:path';

const commbankCsv = path.join(__dirname, '../fixtures/commbank.csv');

test.describe('Categorise Dialog', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/accounts');
    const exists = await page.getByText('Categorise Test Account').isVisible();
    if (!exists) {
      await page.getByRole('button', { name: 'Add account' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('input[name="name"]').fill('Categorise Test Account');
      await dialog.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'CommBank' }).click();
      await dialog.getByRole('button', { name: 'Create account' }).click();
      await page.waitForSelector('text=Categorise Test Account');
    }
    await context.close();
  });

  /** Helper: ensure at least some uncategorised transactions exist */
  async function ensureUncategorised(page: import('@playwright/test').Page) {
    await page.goto('/import');
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Categorise Test Account' }).click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CommBank' }).click();
    await page.locator('#csv-file').setInputFiles(commbankCsv);
    await page.getByRole('button', { name: 'Preview import' }).click();
    const importBtn = page.getByRole('button', { name: /Import \d+ transactions/i });
    if (await importBtn.isEnabled()) {
      await importBtn.click();
      await page.waitForSelector('text=Import complete!');
    }
  }

  /** Helper: open dialog and wait for review table */
  async function openAndWaitForReview(page: import('@playwright/test').Page) {
    await page.goto('/transactions');
    const categoriseBtn = page.getByRole('button', { name: /Categorise \d+ uncategorised/i });
    if (!(await categoriseBtn.isVisible())) return false;
    await categoriseBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 30000 });
    return true;
  }

  test('dialog opens and shows review table with account column', async ({ page }) => {
    await ensureUncategorised(page);
    const opened = await openAndWaitForReview(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.getByRole('dialog');

    // Table headers include Account
    await expect(dialog.getByRole('columnheader', { name: 'Account' })).toBeVisible();

    // Each row should show an account name cell (non-empty td in account column)
    const firstRow = dialog.locator('tbody tr').first();
    // Account is the 3rd td (Date, Description, Account, Amount, Category, Source)
    const accountCell = firstRow.locator('td').nth(2);
    await expect(accountCell).toBeVisible();
  });

  test('cancel closes dialog without applying', async ({ page }) => {
    const opened = await openAndWaitForReview(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('apply leads to suggested rules or done state', async ({ page }) => {
    const opened = await openAndWaitForReview(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.getByRole('dialog');
    const applyBtn = dialog.getByRole('button', { name: /Apply \d+ suggestion/i });

    if (!(await applyBtn.isEnabled())) { test.skip(); return; }

    await applyBtn.click();

    // After applying, either the suggested-rules step or done state appears
    await expect(
      dialog.getByText(/transactions categorised|create rules|future imports/i)
    ).toBeVisible({ timeout: 15000 });
  });

  test('skip rules goes to done state', async ({ page }) => {
    const opened = await openAndWaitForReview(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.getByRole('dialog');
    const applyBtn = dialog.getByRole('button', { name: /Apply \d+ suggestion/i });
    if (!(await applyBtn.isEnabled())) { test.skip(); return; }

    await applyBtn.click();

    // If suggested rules step appears, skip it
    const skipBtn = dialog.getByRole('button', { name: 'Skip' });
    if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await expect(dialog.getByText(/transactions categorised/i)).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('create rules completes to done state', async ({ page }) => {
    // Re-import to get fresh uncategorised transactions
    await ensureUncategorised(page);
    const opened = await openAndWaitForReview(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.getByRole('dialog');
    const applyBtn = dialog.getByRole('button', { name: /Apply \d+ suggestion/i });
    if (!(await applyBtn.isEnabled())) { test.skip(); return; }

    await applyBtn.click();

    // If suggested rules step appears and has rules to create, click create
    const createBtn = dialog.getByRole('button', { name: /Create \d+ rule/i });
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (await createBtn.isEnabled()) {
        await createBtn.click();
      } else {
        // No rules selected — skip
        const skipBtn = dialog.getByRole('button', { name: 'Skip' });
        await skipBtn.click();
      }
    }

    await expect(dialog.getByText(/transactions categorised/i)).toBeVisible({ timeout: 10000 });
  });
});
