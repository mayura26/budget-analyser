import { test, expect } from '@playwright/test';

test.describe('Categories', () => {
  test('seeded categories render', async ({ page }) => {
    await page.goto('/categories');
    await expect(page.getByText('Groceries').first()).toBeVisible();
    // "Income" appears as both a card title and a badge type — use heading-level text
    await expect(page.getByText('Income', { exact: true }).first()).toBeVisible();
  });

  test('rule count shown on category card', async ({ page }) => {
    await page.goto('/categories');
    const groceriesCard = page.locator('.rounded-lg').filter({ hasText: 'Groceries' }).first();
    await expect(groceriesCard.getByText(/\d+ rule/i)).toBeVisible();
  });

  test('expand and collapse category card', async ({ page }) => {
    await page.goto('/categories');
    await page.getByText('Groceries').first().click();
    await expect(page.getByText('Matching rules')).toBeVisible();
    await page.getByText('Groceries').first().click();
    await expect(page.getByText('Matching rules')).not.toBeVisible();
  });

  test('add category', async ({ page }) => {
    await page.goto('/categories');
    await page.getByRole('button', { name: 'Add category' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('E2E Category');

    // Select type Income
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Income' }).click();

    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('E2E Category')).toBeVisible();
    await expect(page.getByText('income').first()).toBeVisible();
  });

  test('add rule to category', async ({ page }) => {
    await page.goto('/categories');
    await page.getByText('E2E Category').first().click();
    await page.getByRole('button', { name: 'Add rule' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="pattern"]').fill('TESTMERCHANT');
    await dialog.getByRole('button', { name: 'Add rule' }).click();

    await expect(page.getByText('TESTMERCHANT')).toBeVisible();
    await expect(page.getByText('keyword').first()).toBeVisible();
  });

  test('delete rule', async ({ page }) => {
    await page.goto('/categories');
    await page.getByText('E2E Category').first().click();
    const ruleRow = page.locator('div').filter({ hasText: /^keyword.*TESTMERCHANT/ }).first();
    await ruleRow.locator('button').click();
    await expect(page.getByText('TESTMERCHANT')).not.toBeVisible();
  });

  test('delete non-system category', async ({ page }) => {
    await page.goto('/categories');
    // Find the E2E Category card header and click its trash button
    const e2eCard = page.locator('.rounded-lg').filter({ hasText: 'E2E Category' }).first();
    await e2eCard.locator('button:has(.lucide-trash-2)').click();
    await expect(page.getByText('E2E Category')).not.toBeVisible();
  });

  test('system category has no delete button', async ({ page }) => {
    await page.goto('/categories');
    const groceriesCard = page.locator('.rounded-lg').filter({ hasText: 'Groceries' }).first();
    await expect(groceriesCard.locator('button:has(.lucide-trash-2)')).not.toBeVisible();
  });
});
