import { test, expect } from '@playwright/test';

test.describe('Accounts', () => {
  test('empty state shows no accounts message', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.getByText('No accounts yet.')).toBeVisible();
  });

  test('create account', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Add account' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('Test Chequing');

    // Select bank profile (second combobox — first is group)
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CommBank' }).click();

    // Currency
    await dialog.locator('input[name="currency"]').clear();
    await dialog.locator('input[name="currency"]').fill('AUD');

    // Color swatch
    await page.locator('label:has(input[value="#3b82f6"])').click();

    await dialog.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Test Chequing')).toBeVisible();
    await expect(page.getByText('CommBank').first()).toBeVisible();
  });

  test('edit account', async ({ page }) => {
    await page.goto('/accounts');
    // Wait for an account card to appear
    await page.waitForSelector('text=Test Chequing');
    await page.locator('button:has(.lucide-pencil)').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const nameInput = dialog.locator('input[name="name"]');
    await nameInput.clear();
    await nameInput.fill('Updated Account');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Updated Account')).toBeVisible();
  });

  test('cancel delete keeps card', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('text=Updated Account');
    await page.locator('button:has(.lucide-trash-2)').first().click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Updated Account')).toBeVisible();
  });

  test('delete account with confirmation', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('text=Updated Account');
    await page.locator('button:has(.lucide-trash-2)').first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    // Wait for the confirmation dialog to close, then check the card is gone
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await expect(page.getByText('Updated Account')).not.toBeVisible();
  });

  test('create group', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Add group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('Test Bank');
    await dialog.getByRole('button', { name: 'Create group' }).click();

    await expect(page.getByText('Test Bank')).toBeVisible();
  });

  test('create account in group', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Add account' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('Test Savings');

    // Select the group
    const comboboxes = dialog.getByRole('combobox');
    await comboboxes.first().click();
    await page.getByRole('option', { name: 'Test Bank' }).click();

    await dialog.getByRole('button', { name: 'Create account' }).click();

    // Account should appear under the group section
    await expect(page.getByText('Test Savings')).toBeVisible();
    await expect(page.getByText('Test Bank')).toBeVisible();
  });

  test('rename group inline', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('text=Test Bank');

    // Group header pencil is the first pencil button on the page (before account card pencils)
    await page.locator('button').filter({ has: page.locator('.lucide-pencil') }).first().click();

    // Inline rename input appears with h-6 class and autoFocus
    const renameInput = page.locator('input[class*="h-6"]');
    await expect(renameInput).toBeVisible();
    await renameInput.clear();
    await renameInput.fill('My Bank');
    await renameInput.press('Enter');

    await expect(page.getByText('My Bank')).toBeVisible();
    await expect(page.getByText('Test Bank')).not.toBeVisible();
  });

  test('delete group ungrouped accounts', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('text=My Bank');

    // Group header trash is the first trash button on the page (before account card trash icons)
    await page.locator('button').filter({ has: page.locator('.lucide-trash-2') }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete group' }).click();

    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Group header gone, account moved to "Other accounts"
    await expect(page.getByText('My Bank')).not.toBeVisible();
    await expect(page.getByText('Test Savings')).toBeVisible();
  });

  test('cleanup: delete Test Savings', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('text=Test Savings');
    // Account card trash is the last trash button (group header trash, if present, comes first)
    await page.locator('button').filter({ has: page.locator('.lucide-trash-2') }).last().click();
    // Use exact match to avoid matching "Delete group" button
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await expect(page.getByText('Test Savings')).not.toBeVisible();
  });
});
