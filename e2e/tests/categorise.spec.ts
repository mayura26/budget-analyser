import { test, expect } from '@playwright/test';

const ACCOUNT_NAME = 'Categorise Test Account';

test.describe.configure({ mode: 'serial' });

test.describe('Categorise Dialog', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();

    await page.goto('/accounts');

    while (true) {
      const card = page.locator('.rounded-lg.border').filter({ hasText: ACCOUNT_NAME }).first();
      if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) break;
      await card.locator('button:has(.lucide-trash-2)').click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
      await page.waitForTimeout(300);
    }

    await page.getByRole('button', { name: 'Add account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(ACCOUNT_NAME);
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CommBank' }).click();
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await page.waitForSelector(`text=${ACCOUNT_NAME}`);

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.request.delete('/api/test-cleanup');
    const seed = await page.request.post('/api/test-seed-transactions', {
      data: { accountName: ACCOUNT_NAME, count: 3, reset: true },
    });
    expect(seed.ok()).toBeTruthy();
  });

  async function openAndWaitForReview(page: import('@playwright/test').Page) {
    await page.goto('/transactions');
    const categoriseBtn = page.getByRole('button', { name: /Categorise \d+ uncategorised/i });
    await expect(categoriseBtn).toBeVisible({ timeout: 15_000 });
    await categoriseBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  }

  async function ensureApplyEnabled(page: import('@playwright/test').Page, dialog: import('@playwright/test').Locator) {
    const applyBtn = dialog.getByRole('button', { name: /Apply \d+ suggestion/i });
    if (!(await applyBtn.isEnabled())) {
      await dialog.locator('tbody tr').first().getByRole('combobox').click();
      await page.getByRole('option', { name: 'Groceries' }).first().click();
      await expect(applyBtn).toBeEnabled({ timeout: 5000 });
    }
    return applyBtn;
  }

  /** Apply finished: success copy in dialog, or dialog closed after revalidate (still a success path). */
  async function waitForApplyFinished(page: import('@playwright/test').Page) {
    await page.waitForFunction(
      () => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return true;
        const text = d.textContent ?? '';
        return /transactions categorised|create rules for future imports/i.test(text);
      },
      { timeout: 25_000 }
    );
  }

  test('dialog opens and shows review table with account column', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');

    await expect(dialog.getByRole('columnheader', { name: 'Account' })).toBeVisible();

    const firstRow = dialog.locator('tbody tr').first();
    const accountCell = firstRow.locator('td').nth(2);
    await expect(accountCell).toBeVisible();
  });

  test('cancel closes dialog without applying', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('apply leads to suggested rules or done state', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);
  });

  test('skip rules goes to done state', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    if (await page.getByRole('dialog').isVisible().catch(() => false)) {
      const d = page.getByRole('dialog');
      const skipBtn = d.getByRole('button', { name: 'Skip' });
      if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(skipBtn).toBeEnabled({ timeout: 15_000 });
        await skipBtn.click();
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i)).toBeVisible({ timeout: 10_000 });
        await d.getByRole('button', { name: 'Close' }).click();
      }
    }
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('create rules completes to done state', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    if (await page.getByRole('dialog').isVisible().catch(() => false)) {
      const d = page.getByRole('dialog');
      const createBtn = d.getByRole('button', { name: /Create \d+ rule/i });
      if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        if (await createBtn.isEnabled()) {
          await createBtn.click();
        } else {
          await d.getByRole('button', { name: 'Skip' }).click();
        }
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i)).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('apply categorisation marks category confirmed on transactions list', async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = page.getByRole('dialog');
    const descSnippet = (
      await dialog.locator('tbody tr').first().locator('td').nth(1).innerText()
    ).slice(0, 28);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    if (await page.getByRole('dialog').isVisible().catch(() => false)) {
      const d = page.getByRole('dialog');
      const skipBtn = d.getByRole('button', { name: 'Skip' });
      if (await skipBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await expect(skipBtn).toBeEnabled({ timeout: 15_000 });
        await skipBtn.click();
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i)).toBeVisible({ timeout: 15_000 });
        await d.getByRole('button', { name: 'Close' }).click();
      }
    }
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.goto('/transactions');
    await page.getByPlaceholder('Search transactions…').fill(descSnippet.trim());
    const row = page.locator('tbody tr').first();
    await expect(row.getByTestId('confirm-category')).toBeChecked({ timeout: 10_000 });
  });
});
