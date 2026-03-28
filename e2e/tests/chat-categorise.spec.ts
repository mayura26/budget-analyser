import { test, expect } from '@playwright/test';
import path from 'node:path';

const commbankCsv = path.join(__dirname, '../fixtures/commbank.csv');

test.describe('Chat Categorise Dialog', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();

    // Remove user-defined rules so imports stay uncategorised
    await page.request.delete('/api/test-cleanup');

    await page.goto('/accounts');

    // Delete existing test account to start fresh
    while (true) {
      const card = page.locator('.rounded-lg.border').filter({ hasText: 'Chat Test Account' }).first();
      if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) break;
      await card.locator('button:has(.lucide-trash-2)').click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
      await page.waitForTimeout(300);
    }

    // Create fresh account
    await page.getByRole('button', { name: 'Add account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('Chat Test Account');
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CommBank' }).click();
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await page.waitForSelector('text=Chat Test Account');

    // Import transactions
    await page.goto('/import');
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Chat Test Account' }).click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CommBank' }).click();
    await page.locator('#csv-file').setInputFiles(commbankCsv);
    await page.getByRole('button', { name: 'Preview import' }).click();

    const importBtn = page.getByRole('button', { name: /Import \d+ transactions/i });
    await importBtn.waitFor({ state: 'visible' });
    if (await importBtn.isEnabled()) {
      await importBtn.click();
      await expect(page.getByText('Import complete!')).toBeVisible();
    }

    await context.close();
  });

  test('Chat & Categorise button appears when uncategorised transactions exist', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByRole('combobox').filter({ hasText: /all accounts/i }).click();
    await page.getByRole('option', { name: 'Chat Test Account' }).click();

    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount === 0, 'No transactions for Chat Test Account');

    // Filter to uncategorised to verify count
    await page.getByRole('combobox').filter({ hasText: /all categories/i }).click();
    await page.getByRole('option', { name: 'Uncategorised' }).first().click();

    const uncatCount = await page.locator('tbody tr').count();
    test.skip(uncatCount === 0, 'No uncategorised transactions — all may be categorised by rules');

    // Navigate to all transactions to see the button
    await page.goto('/transactions');
    await expect(page.getByTestId('chat-categorise-button')).toBeVisible();
  });

  test('dialog opens and AI sends first message', async ({ page }) => {
    await page.goto('/transactions');
    const btn = page.getByTestId('chat-categorise-button');
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No uncategorised transactions');
      return;
    }

    await btn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Should show a transaction card (description text visible)
    // Wait for AI response bubble (may take a few seconds)
    const aiEnabled = await page.evaluate(async () => {
      const r = await fetch('/api/chat-categorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 999999, messages: [], categories: [] }),
      });
      return r.status !== 503;
    });

    if (!aiEnabled) {
      // AI not configured — dialog still opens, shows loading then error
      await expect(dialog.getByText(/AI is disabled|OPENAI_API_KEY/i)).toBeVisible({ timeout: 10000 });
    } else {
      // AI configured — should show a chat bubble
      await expect(dialog.locator('.rounded-lg.bg-muted')).toBeVisible({ timeout: 15000 });
    }
  });

  test('skip button advances to next transaction', async ({ page }) => {
    await page.goto('/transactions');
    const btn = page.getByTestId('chat-categorise-button');
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No uncategorised transactions');
      return;
    }

    await btn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Skip should be available immediately
    const skipBtn = dialog.getByTestId('skip-transaction');
    await expect(skipBtn).toBeVisible({ timeout: 5000 });

    // Click skip — should either advance or reach done
    await skipBtn.click();
    // Dialog should still be open (either next transaction or done state)
    await expect(dialog).toBeVisible();
  });

  test('skipping all transactions reaches done state', async ({ page }) => {
    await page.goto('/transactions');
    const btn = page.getByTestId('chat-categorise-button');
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No uncategorised transactions');
      return;
    }

    await btn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Keep skipping until we hit done or close button
    for (let i = 0; i < 20; i++) {
      const skipBtn = dialog.getByTestId('skip-transaction');
      const closeBtn = dialog.getByRole('button', { name: 'Close' });

      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) break;
      if (!(await skipBtn.isVisible({ timeout: 3000 }).catch(() => false))) break;
      await skipBtn.click();
      await page.waitForTimeout(200);
    }

    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
