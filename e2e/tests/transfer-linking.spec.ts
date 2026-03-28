import { expect, type Page, test } from "@playwright/test";

const TODAY = new Date().toISOString().slice(0, 10);

async function selectAccountByName(page: Page, name: string) {
  await page.locator("#accountId").evaluate((select, wanted) => {
    const s = select as HTMLSelectElement;
    for (let i = 0; i < s.options.length; i++) {
      if (s.options[i].text.trim() === wanted) {
        s.selectedIndex = i;
        s.dispatchEvent(new Event("input", { bubbles: true }));
        s.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    throw new Error(`No account option: ${wanted}`);
  }, name);
}

test.describe("Transfer Linking", () => {
  // Create two accounts and matching transfer transactions, then test linking/unlinking

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // ── Clean up leftover data from previous runs (handles server DB connection reuse) ──
    await page.goto("/accounts");
    for (const name of ["Transfer Test A", "Transfer Test B"]) {
      // Keep deleting while the account exists (handles multiple duplicates)
      while (true) {
        const card = page
          .locator(".rounded-lg.border")
          .filter({ hasText: name })
          .first();
        if (!(await card.isVisible({ timeout: 2000 }).catch(() => false)))
          break;
        await card.locator("button:has(.lucide-trash-2)").click();
        await page.getByRole("button", { name: "Delete" }).click();
        await page.waitForSelector('[role="dialog"]', { state: "hidden" });
        await page.waitForTimeout(300);
      }
    }

    // ── Create Account A ──
    await page.getByRole("button", { name: "Add account" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator('input[name="name"]').fill("Transfer Test A");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector("text=Transfer Test A");

    // Create Account B
    await page.getByRole("button", { name: "Add account" }).click();
    dialog = page.getByRole("dialog");
    await dialog.locator('input[name="name"]').fill("Transfer Test B");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector("text=Transfer Test B");

    // Add manual transaction on Account A (debit -100)
    await page.goto("/transactions/new");
    await selectAccountByName(page, "Transfer Test A");
    await page.locator('input[name="date"]').fill(TODAY);
    await page.locator('input[name="description"]').fill("Transfer to B");
    await page.locator('input[name="amount"]').fill("-100");
    await page.getByRole("button", { name: "Save transaction" }).click();
    await page.waitForURL("/transactions");

    // Add manual transaction on Account B (credit +100)
    await page.goto("/transactions/new");
    await selectAccountByName(page, "Transfer Test B");
    await page.locator('input[name="date"]').fill(TODAY);
    await page.locator('input[name="description"]').fill("Transfer from A");
    await page.locator('input[name="amount"]').fill("100");
    await page.getByRole("button", { name: "Save transaction" }).click();
    await page.waitForURL("/transactions");

    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Delete both test accounts (cascades transactions)
    await page.goto("/accounts");
    for (const name of ["Transfer Test A", "Transfer Test B"]) {
      await page.waitForSelector(`text=${name}`);
      await page.locator("button:has(.lucide-trash-2)").first().click();
      await page.getByRole("button", { name: "Delete" }).click();
      await page.waitForSelector('[role="dialog"]', { state: "hidden" });
    }
    await page.close();
  });

  test("categorise both transactions as Transfer", async ({ page }) => {
    // Set "Transfer to B" category to Transfer (whatever it currently shows)
    await page.goto("/transactions");
    const toB = page.locator("tr").filter({ hasText: "Transfer to B" });
    // Click the category button — it may show "Not processed" or any category name
    // Exclude Link/Linked buttons and icon-only delete button (no word chars)
    await toB
      .locator("button")
      .filter({ hasNotText: /Link|Linked/ })
      .filter({ hasText: /\w/ })
      .first()
      .click();
    await page.getByRole("option", { name: "Transfer" }).first().click();
    await expect(toB.getByText("Transfer", { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Reload before second categorisation to avoid re-render race conditions
    await page.goto("/transactions");

    // Set "Transfer from A" category to Transfer (whatever it currently shows)
    const fromA = page.locator("tr").filter({ hasText: "Transfer from A" });
    await fromA
      .locator("button")
      .filter({ hasNotText: /Link|Linked/ })
      .filter({ hasText: /\w/ })
      .first()
      .click();
    await page.getByRole("option", { name: "Transfer" }).first().click();
    await expect(fromA.getByText("Transfer", { exact: true })).toBeVisible({
      timeout: 10000,
    });
  });

  test("Link button appears on transfer transactions", async ({ page }) => {
    await page.goto("/transactions");
    const toB = page.locator("tr").filter({ hasText: "Transfer to B" });
    await expect(toB.locator("button", { hasText: "Link" })).toBeVisible();
  });

  test("link transfer and verify Linked badge", async ({ page }) => {
    await page.goto("/transactions");

    // Ensure page is fully hydrated before clicking
    await page.waitForLoadState("networkidle");

    const toB = page.locator("tr").filter({ hasText: "Transfer to B" });
    await toB.locator("button", { hasText: "Link" }).click();

    // Wait for the popover content wrapper to appear with Transfer from A candidate
    const popoverContent = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popoverContent).toBeVisible({ timeout: 10000 });
    // Use a long timeout — the server action may take several seconds
    await expect(popoverContent.getByText("Transfer from A")).toBeVisible({
      timeout: 25000,
    });

    // Click the first candidate button in the popover
    await popoverContent.locator("button").first().click();

    // Both rows should now show "Linked"
    await expect(toB.locator("button", { hasText: "Linked" })).toBeVisible({
      timeout: 5000,
    });
    const fromA = page.locator("tr").filter({ hasText: "Transfer from A" });
    await expect(fromA.locator("button", { hasText: "Linked" })).toBeVisible();
  });

  test("unlink transfer", async ({ page }) => {
    await page.goto("/transactions");

    const toB = page.locator("tr").filter({ hasText: "Transfer to B" });
    await toB.locator("button", { hasText: "Linked" }).click();

    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    await popover.getByRole("button", { name: "Unlink" }).click();

    // "Link" button should reappear
    await expect(toB.locator("button", { hasText: "Link" })).toBeVisible({
      timeout: 5000,
    });
  });
});
