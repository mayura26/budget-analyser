import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const ACCOUNT_NAME = "Categorise Test Account";

function aiCategoriseDialog(page: Page) {
  return page.getByRole("dialog", { name: "AI Categorisation" });
}

test.describe.configure({ mode: "serial" });

test.describe("Categorise Dialog", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/user.json",
    });
    const page = await context.newPage();

    await page.goto("/accounts");

    while (true) {
      const card = page
        .locator(".rounded-lg.border")
        .filter({ hasText: ACCOUNT_NAME })
        .first();
      if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) break;
      await card.locator("button:has(.lucide-trash-2)").click();
      await page.getByRole("button", { name: "Delete" }).click();
      await page.waitForSelector('[role="dialog"]', { state: "hidden" });
      await page.waitForTimeout(300);
    }

    await page.getByRole("button", { name: "Add account" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(ACCOUNT_NAME);
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector(`text=${ACCOUNT_NAME}`);

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.request.delete("/api/test-cleanup");
    const seed = await page.request.post("/api/test-seed-transactions", {
      data: { accountName: ACCOUNT_NAME, count: 3, reset: true },
    });
    expect(seed.ok()).toBeTruthy();
  });

  async function openAndWaitForReview(page: Page) {
    await page.goto("/transactions");
    const categoriseBtn = page.getByTestId("bulk-ai-categorise");
    await expect(categoriseBtn).toBeVisible({ timeout: 15_000 });
    await categoriseBtn.click();
    const scopeUncategorised = page.getByTestId("bulk-ai-scope-uncategorised");
    if (await scopeUncategorised.isVisible({ timeout: 1500 }).catch(() => false)) {
      await scopeUncategorised.click();
    }
    const dialog = aiCategoriseDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("tbody tr").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  async function ensureApplyEnabled(
    page: Page,
    dialog: import("@playwright/test").Locator,
  ) {
    const applyBtn = dialog.getByRole("button", {
      name: /Apply \d+ suggestion/i,
    });
    if (!(await applyBtn.isEnabled())) {
      await dialog.locator("tbody tr").first().getByRole("combobox").click();
      await page.getByRole("option", { name: "Groceries" }).first().click();
      await expect(applyBtn).toBeEnabled({ timeout: 5000 });
    }
    return applyBtn;
  }

  /** Success copy visible, or dialog closed after revalidate. */
  async function waitForApplyFinished(page: Page) {
    const dialog = aiCategoriseDialog(page);
    await expect(async () => {
      const visible = await dialog.isVisible().catch(() => false);
      if (!visible) return;
      const text = await dialog.innerText();
      expect(text).toMatch(
        /transactions categorised|create rules for future imports/i,
      );
    }).toPass({ timeout: 25_000 });
  }

  test("dialog opens and shows review table with account column", async ({
    page,
  }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);

    await expect(
      dialog.getByRole("columnheader", { name: "Account" }),
    ).toBeVisible();

    const firstRow = dialog.locator("tbody tr").first();
    const accountCell = firstRow.locator("td").nth(2);
    await expect(accountCell).toBeVisible();
  });

  test("cancel closes dialog without applying", async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("apply leads to suggested rules or done state", async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);
  });

  test("skip rules goes to done state", async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    const d = aiCategoriseDialog(page);
    if (await d.isVisible().catch(() => false)) {
      const skipBtn = d.getByRole("button", { name: "Skip" });
      if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(skipBtn).toBeEnabled({ timeout: 15_000 });
        await skipBtn.click();
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i).first()).toBeVisible({
          timeout: 10_000,
        });
        await d.getByRole("button", { name: "Close" }).first().click();
      }
    }
    await expect(aiCategoriseDialog(page)).not.toBeVisible();
  });

  test("create rules completes to done state", async ({ page }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    const d = aiCategoriseDialog(page);
    if (await d.isVisible().catch(() => false)) {
      const createBtn = d.getByTestId("create-rules-only-bulk");
      if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        if (await createBtn.isEnabled()) {
          await createBtn.click();
        } else {
          const skip = d.getByRole("button", { name: "Skip" });
          await expect(skip).toBeEnabled({ timeout: 15_000 });
          await skip.click();
        }
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i).first()).toBeVisible({
          timeout: 10_000,
        });
      }
    }
  });

  test("apply categorisation marks category confirmed on transactions list", async ({
    page,
  }) => {
    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    const descSnippet = (
      await dialog.locator("tbody tr").first().locator("td").nth(1).innerText()
    ).slice(0, 28);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await applyBtn.click();
    await waitForApplyFinished(page);

    const d = aiCategoriseDialog(page);
    if (await d.isVisible().catch(() => false)) {
      const skipBtn = d.getByRole("button", { name: "Skip" });
      if (await skipBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await expect(skipBtn).toBeEnabled({ timeout: 15_000 });
        await skipBtn.click();
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await d.getByRole("button", { name: "Close" }).first().click();
      }
    }
    await expect(aiCategoriseDialog(page)).not.toBeVisible();

    await page.goto("/transactions");
    await page
      .getByPlaceholder("Search transactions…")
      .fill(descSnippet.trim());
    const row = page.locator("tbody tr").first();
    await expect(row.getByTestId("confirm-category")).toBeChecked({
      timeout: 10_000,
    });
  });

  test("apply with verify unchecked leaves transaction unconfirmed", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup");
    const seed = await page.request.post("/api/test-seed-transactions", {
      data: { accountName: ACCOUNT_NAME, count: 1, reset: true },
    });
    expect(seed.ok()).toBeTruthy();

    await openAndWaitForReview(page);

    const dialog = aiCategoriseDialog(page);
    const applyBtn = await ensureApplyEnabled(page, dialog);

    await dialog
      .locator("tbody tr")
      .first()
      .getByTestId("bulk-verify-when-apply")
      .uncheck();

    await applyBtn.click();
    await waitForApplyFinished(page);

    const d = aiCategoriseDialog(page);
    if (await d.isVisible().catch(() => false)) {
      const skipBtn = d.getByRole("button", { name: "Skip" });
      if (await skipBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await expect(skipBtn).toBeEnabled({ timeout: 15_000 });
        await skipBtn.click();
      }
      if (await d.isVisible().catch(() => false)) {
        await expect(d.getByText(/transactions categorised/i).first()).toBeVisible(
          {
            timeout: 15_000,
          },
        );
        await d.getByRole("button", { name: "Close" }).first().click();
      }
    }
    await expect(aiCategoriseDialog(page)).not.toBeVisible();

    await page.goto("/transactions");
    const row = page.locator("tbody tr").first();
    await expect(row.getByTestId("confirm-category")).not.toBeChecked({
      timeout: 10_000,
    });
  });

  test.describe("Bulk AI — needs confirmation only", () => {
    test.beforeEach(async ({ page }) => {
      await page.request.delete("/api/test-cleanup");
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName: ACCOUNT_NAME,
          count: 2,
          reset: true,
          variant: "needs_review",
        },
      });
      expect(seed.ok()).toBeTruthy();
    });

    test("Recategorise all unconfirmed opens AI dialog with current category", async ({
      page,
    }) => {
      await page.goto("/transactions");
      const btn = page.getByTestId("bulk-ai-categorise");
      await expect(btn).toBeVisible({ timeout: 15_000 });
      await expect(btn).toContainText(/Recategorise all unconfirmed/i);
      await btn.click();
      const dialog = aiCategoriseDialog(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("tbody tr").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        dialog.getByText(/Current:/, { exact: false }).first(),
      ).toBeVisible();
    });
  });
});
