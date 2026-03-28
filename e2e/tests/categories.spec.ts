import { test, expect } from '@playwright/test';

test.describe('Categories', () => {
  test('seeded main groups and sub-categories render', async ({ page }) => {
    await page.goto('/categories');
    await expect(page.getByRole('heading', { name: 'Living Costs' })).toBeVisible();
    await expect(page.getByText('Groceries').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Money IN' })).toBeVisible();
    await expect(page.getByText('Income (salary / primary)', { exact: true }).first()).toBeVisible();
  });

  test('rule count shown on sub-category card', async ({ page }) => {
    await page.goto('/categories');
    const groceriesCard = page.locator('.rounded-lg').filter({ hasText: 'Groceries' }).first();
    await expect(groceriesCard.getByText(/\d+ rule/i)).toBeVisible();
  });

  test('expand and collapse sub-category card', async ({ page }) => {
    await page.goto('/categories');
    await page.getByText('Groceries').first().click();
    await expect(page.getByText('Matching rules')).toBeVisible();
    await page.getByText('Groceries').first().click();
    await expect(page.getByText('Matching rules')).not.toBeVisible();
  });

  test('add sub-category', async ({ page }) => {
    await page.goto('/categories');
    await page.getByRole('button', { name: 'Add sub-category' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Living Costs' }).click();
    await dialog.locator('input[name="name"]').fill('E2E Category');

    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('E2E Category').first()).toBeVisible();
    await expect(page.getByText('Expense').first()).toBeVisible();
  });

  test('add rule to sub-category', async ({ page }) => {
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

  test('delete non-system sub-category', async ({ page }) => {
    await page.goto('/categories');
    const e2eCard = page.locator('.rounded-lg').filter({ hasText: 'E2E Category' }).first();
    await e2eCard.locator('button:has(.lucide-trash-2)').click();
    await expect(page.getByText('E2E Category')).not.toBeVisible();
  });

  test('system sub-category has no delete button', async ({ page }) => {
    await page.goto('/categories');
    const groceriesCard = page.locator('.rounded-lg').filter({ hasText: 'Groceries' }).first();
    await expect(groceriesCard.locator('button:has(.lucide-trash-2)')).not.toBeVisible();
  });
});
