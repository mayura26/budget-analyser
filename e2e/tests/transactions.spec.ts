import { test, expect } from '@playwright/test';
import path from 'node:path';

const commbankCsv = path.join(__dirname, '../fixtures/commbank.csv');

test.describe('Transactions', () => {
  test.beforeAll(async ({ browser }) => {
    // Ensure "Import Test Account" exists and has transactions
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/transactions');
    const hasRows = (await page.locator('tbody tr').count()) > 0;
    if (!hasRows) {
      // Create account
      await page.goto('/accounts');
      const accountExists = await page.getByText('Import Test Account').isVisible();
      if (!accountExists) {
        await page.getByRole('button', { name: 'Add account' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('input[name="name"]').fill('Import Test Account');
        await dialog.getByRole('combobox').click();
        await page.getByRole('option', { name: 'CommBank' }).click();
        await dialog.getByRole('button', { name: 'Create account' }).click();
        await page.waitForSelector('text=Import Test Account');
      }

      // Import CSV
      await page.goto('/import');
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'Import Test Account' }).click();
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'CommBank' }).click();
      await page.locator('#csv-file').setInputFiles(commbankCsv);
      await page.getByRole('button', { name: 'Preview import' }).click();
      await page.getByRole('button', { name: /Import/i }).click();
      await page.waitForSelector('text=Import complete!');
    }
    await context.close();
  });

  test('table columns render', async ({ page }) => {
    await page.goto('/transactions');
    for (const col of ['Date', 'Description', 'Account', 'Category', 'OK', 'Amount']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }
  });

  test('search filter narrows results', async ({ page }) => {
    await page.goto('/transactions');
    // Scope to the known account so we don't match rows from other suites.
    const accountSelect = page.getByRole('combobox').filter({ hasText: /all accounts/i });
    await accountSelect.click();
    await page.getByRole('option', { name: 'Import Test Account' }).click();
    await page.getByPlaceholder('Search transactions…').fill('CHEMIST');
    await expect(
      page
        .locator('tbody')
        .getByText('CHEMIST WAREHOUSE RANDWICK NS AUS Card xx5993 Value Date: 15/03/2026')
        .first()
    ).toBeVisible();
    await expect(page.getByText(/Showing \d+ of/i)).toBeVisible();
  });

  test('account filter updates URL', async ({ page }) => {
    await page.goto('/transactions');
    const accountSelect = page.getByRole('combobox').filter({ hasText: /all accounts/i });
    await accountSelect.click();
    await page.getByRole('option', { name: 'Import Test Account' }).click();
    await expect(page).toHaveURL(/accountId=/);
  });

  test('category filter uncategorised updates URL', async ({ page }) => {
    await page.goto('/transactions');
    const catSelect = page.getByRole('combobox').filter({ hasText: /all categories/i });
    await catSelect.click();
    await page.getByRole('option', { name: 'Not processed' }).first().click();
    await expect(page).toHaveURL(/categoryId=none/);
  });

  test('needs review filter updates URL', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('filter-needs-review').click();
    await page.getByRole('option', { name: 'Needs confirmation' }).click();
    await expect(page).toHaveURL(/needsReview=1/);
  });

  test('inline category change', async ({ page }) => {
    await page.goto('/transactions');
    // Click the first category cell button (shows category or "Not processed")
    await page.locator('td button').first().click();
    await page.getByRole('option', { name: 'Groceries' }).click();
    await expect(page.getByText('Groceries').first()).toBeVisible();
  });

  test('inline category change leaves confirmation unchecked until ticked', async ({ page }) => {
    await page.goto('/transactions');
    const accountSelect = page.getByRole('combobox').filter({ hasText: /all accounts/i });
    await accountSelect.click();
    await page.getByRole('option', { name: 'Import Test Account' }).click();

    const firstRow = page.locator('tbody tr').first();
    await firstRow.locator('td').nth(3).locator('button').click();
    await page.getByRole('option', { name: 'Dining' }).click();
    await expect(firstRow.getByTestId('confirm-category')).not.toBeChecked();
    await firstRow.getByTestId('confirm-category').check();
    await expect(firstRow.getByTestId('confirm-category')).toBeChecked();
  });

  test('manual transaction with category starts confirmed', async ({ page }) => {
    await page.goto('/transactions/new');
    await page.getByLabel('Description').fill('E2E confirmed category');
    await page.getByLabel('Amount (negative = expense)').fill('-3.50');
    await page.locator('select#categoryId').selectOption({ label: 'Groceries' });
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page).toHaveURL('/transactions', { timeout: 15000 });
    const row = page.locator('tbody tr').filter({ hasText: 'E2E confirmed category' });
    await expect(row.getByTestId('confirm-category')).toBeChecked();
  });

  test('process uncategorised button visible when uncategorised rows exist', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByRole('combobox').filter({ hasText: /all categories/i }).click();
    await page.getByRole('option', { name: 'Not processed' }).first().click();
    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount === 0, 'No uncategorised rows in fixture');
    await expect(page.getByTestId('process-uncategorised')).toBeVisible();
  });

  test('add manual transaction', async ({ page }) => {
    await page.goto('/transactions/new');
    await page.getByLabel('Description').fill('Manual Coffee Purchase');
    await page.getByLabel('Amount (negative = expense)').fill('5.00');
    // Account is a native select — pick first option (Import Test Account)
    await page.locator('select#accountId').selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page).toHaveURL('/transactions', { timeout: 15000 });
    await expect(page.getByText('Manual Coffee Purchase')).toBeVisible();
  });

  test('delete transaction', async ({ page }) => {
    await page.goto('/transactions');
    const deleteButtons = page.locator('[data-testid="delete-transaction"]');
    const initialCount = await deleteButtons.count();
    if (initialCount === 0) return; // no data available (isolated run without imports)

    await deleteButtons.first().click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(deleteButtons).toHaveCount(initialCount - 1, { timeout: 5000 });
  });
});
