import path from "node:path";
import { expect, test } from "@playwright/test";

const commbankCsv = path.join(__dirname, "../fixtures/commbank.csv");

test.describe("Transactions", () => {
  test.beforeAll(async ({ browser }) => {
    // Ensure "Import Test Account" exists and has transactions
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/transactions");
    const hasRows = (await page.locator("tbody tr").count()) > 0;
    if (!hasRows) {
      // Create account
      await page.goto("/accounts");
      const accountExists = await page
        .getByText("Import Test Account")
        .isVisible();
      if (!accountExists) {
        await page.getByRole("button", { name: "Add account" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await dialog.locator('input[name="name"]').fill("Import Test Account");
        await dialog.getByRole("combobox").click();
        await page.getByRole("option", { name: "CommBank" }).click();
        await dialog.getByRole("button", { name: "Create account" }).click();
        await page.waitForSelector("text=Import Test Account");
      }

      // Import CSV
      await page.goto("/import");
      await page.getByRole("combobox").nth(0).click();
      await page.getByRole("option", { name: "Import Test Account" }).click();
      await page.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "CommBank" }).click();
      await page.locator("#csv-file").setInputFiles(commbankCsv);
      await page.getByRole("button", { name: "Preview import" }).click();
      await page.getByRole("button", { name: /Import/i }).click();
      await page.waitForSelector("text=Import complete!");
    }
    await context.close();
  });

  test("table columns render", async ({ page }) => {
    await page.goto("/transactions");
    for (const col of [
      "Date",
      "Description",
      "Account",
      "Category",
      "Verified",
      "Amount",
    ]) {
      await expect(page.getByRole("columnheader", { name: col })).toBeVisible();
    }
  });

  test("search filter narrows results", async ({ page }) => {
    await page.goto("/transactions");
    // Scope to the known account so we don't match rows from other suites.
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByPlaceholder("Search transactions…").fill("CHEMIST");
    await expect(
      page
        .locator("tbody")
        .getByText(
          "CHEMIST WAREHOUSE RANDWICK NS AUS Card xx5993 Value Date: 15/03/2026",
        )
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/Showing \d+ of/i)).toBeVisible();
  });

  test("account filter updates URL", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await expect(page).toHaveURL(/accountId=/);
  });

  test("category filter uncategorised updates URL", async ({ page }) => {
    await page.goto("/transactions");
    const catSelect = page
      .getByRole("combobox")
      .filter({ hasText: /all categories/i });
    await catSelect.click();
    await page.getByRole("option", { name: "Not processed" }).first().click();
    await expect(page).toHaveURL(/categoryId=none/);
  });

  test("needs review filter updates URL", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-needs-review").click();
    await page.getByRole("option", { name: "Needs confirmation" }).click();
    await expect(page).toHaveURL(/needsReview=1/);
  });

  test("inline category change", async ({ page }) => {
    await page.goto("/transactions");
    // Click the first category cell button (shows category or "Not processed")
    await page.locator("td button").first().click();
    await page.getByRole("option", { name: "Groceries" }).click();
    await expect(page.getByText("Groceries").first()).toBeVisible();
  });

  test("inline category change leaves confirmation unchecked until ticked", async ({
    page,
  }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    const firstRow = page.locator("tbody tr").first();
    await firstRow.locator("td").nth(3).locator("button").click();
    await page.getByRole("option", { name: "Dining" }).click();
    await expect(firstRow.getByTestId("confirm-category")).not.toBeChecked();
    await firstRow.getByTestId("confirm-category").check();
    await expect(firstRow.getByTestId("confirm-category")).toBeChecked();
  });

  test("manual transaction with category starts confirmed", async ({
    page,
  }) => {
    await page.goto("/transactions/new");
    await page.getByLabel("Description").fill("E2E confirmed category");
    await page.getByLabel("Amount (negative = expense)").fill("-3.50");
    await page
      .locator("select#categoryId")
      .selectOption({ label: "Groceries" });
    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page).toHaveURL("/transactions", { timeout: 15000 });
    const row = page
      .locator("tbody tr")
      .filter({ hasText: "E2E confirmed category" });
    await expect(row.getByTestId("confirm-category")).toBeChecked();
  });

  test("AI actions menu shows process uncategorised when uncategorised rows exist", async ({
    page,
  }) => {
    await page.goto("/transactions");
    await page
      .getByRole("combobox")
      .filter({ hasText: /all categories/i })
      .click();
    await page.getByRole("option", { name: "Not processed" }).first().click();
    const rowCount = await page.locator("tbody tr").count();
    test.skip(rowCount === 0, "No uncategorised rows in fixture");
    await page.getByTestId("ai-actions-menu").click();
    await expect(page.getByTestId("process-uncategorised")).toBeVisible();
  });

  test("AI actions menu shows find mismatches option", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("ai-actions-menu").click();
    await expect(page.getByTestId("find-mismatches")).toBeVisible();
  });

  test("add manual transaction", async ({ page }) => {
    await page.goto("/transactions/new");
    await page.getByLabel("Description").fill("Manual Coffee Purchase");
    await page.getByLabel("Amount (negative = expense)").fill("5.00");
    // Account is a native select — pick first option (Import Test Account)
    await page.locator("select#accountId").selectOption({ index: 0 });
    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page).toHaveURL("/transactions", { timeout: 15000 });
    await expect(page.getByText("Manual Coffee Purchase")).toBeVisible();
  });

  test("delete transaction", async ({ page }) => {
    await page.goto("/transactions");
    const deleteButtons = page.locator('[data-testid="delete-transaction"]');
    const initialCount = await deleteButtons.count();
    if (initialCount === 0) return; // no data available (isolated run without imports)

    await deleteButtons.first().click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(deleteButtons).toHaveCount(initialCount - 1, {
      timeout: 5000,
    });
  });

  test("create rule dialog shows description, token chips, and empty pattern", async ({
    page,
  }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    const firstRow = page.locator("tbody tr").first();
    const description = await firstRow.locator("td").nth(2).innerText();
    await firstRow.getByTestId("create-rule-from-transaction").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Description shown at top
    await expect(dialog.locator(".font-mono.break-all")).toContainText(description.trim());
    // Pattern starts empty
    const patternInput = dialog.getByTestId("create-rule-pattern");
    await expect(patternInput).toHaveValue("");
    // Token chips present (at least one)
    await expect(dialog.locator("button.font-mono").first()).toBeVisible();
  });

  test("clicking token chip populates pattern field", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    const firstRow = page.locator("tbody tr").first();
    await firstRow.getByTestId("create-rule-from-transaction").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const firstChip = dialog.locator("button.font-mono").first();
    const chipText = await firstChip.innerText();
    await firstChip.click();
    await expect(dialog.getByTestId("create-rule-pattern")).toHaveValue(chipText);
  });

  test("bulk select all rows shows action bar", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    const rowCount = await page.locator("tbody tr").count();
    test.skip(rowCount === 0, "No transactions for bulk select test");
    await page.getByTestId("select-all-rows").click();
    await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
    await expect(page.getByTestId("bulk-action-bar")).toContainText(`${rowCount} selected`);
  });

  test("bulk select individual rows shows count in bar", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    const rowCount = await page.locator("tbody tr").count();
    test.skip(rowCount < 2, "Need at least 2 rows for bulk select count test");
    const checkboxes = page.getByTestId("select-row");
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.getByTestId("bulk-action-bar")).toContainText("2 selected");
    await checkboxes.nth(0).click();
    await expect(page.getByTestId("bulk-action-bar")).toContainText("1 selected");
  });

  test("bulk clear selection hides bar", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByTestId("filter-account").click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    const rowCount = await page.locator("tbody tr").count();
    test.skip(rowCount === 0, "No transactions for bulk clear test");
    await page.getByTestId("select-all-rows").click();
    await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
    await page.getByTestId("bulk-clear-selection").click();
    await expect(page.getByTestId("bulk-action-bar")).not.toBeVisible();
  });

  test("non-home account amounts show home value with account value below", async ({
    page,
  }) => {
    const usdAccountName = `E2E USD Account ${Date.now()}`;
    const txnDescription = `E2E USD txn ${Date.now()}`;

    await page.goto("/accounts");
    await page.getByRole("button", { name: "Add account" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(usdAccountName);
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "USD" }).click();
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(usdAccountName)).toBeVisible();

    await page.goto("/transactions/new");
    await page.getByLabel("Description").fill(txnDescription);
    await page.getByLabel("Amount (negative = expense)").fill("-150");
    await page
      .locator("select#accountId")
      .selectOption({ label: usdAccountName });
    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page).toHaveURL("/transactions", { timeout: 15000 });

    const row = page.locator("tbody tr").filter({ hasText: txnDescription });
    await expect(row).toBeVisible();
    const amountCell = row.locator("td").nth(5);
    await expect(amountCell.locator("span.text-sm.font-medium")).toBeVisible();
    await expect(
      amountCell.locator("span.text-xs.text-muted-foreground"),
    ).toContainText("USD");
  });
});
