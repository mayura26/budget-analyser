import path from "node:path";
import { expect, test } from "@playwright/test";

const commbankCsv = path.join(__dirname, "../fixtures/commbank.csv");
const commbankDupCsv = path.join(__dirname, "../fixtures/commbank-dup.csv");
const monzoCsv = path.join(__dirname, "../fixtures/monzo.csv");
const monzoTransfersCsv = path.join(
  __dirname,
  "../fixtures/monzo-transfers.csv",
);
const colesCsv = path.join(__dirname, "../fixtures/coles.csv");
const colesPendingCsv = path.join(__dirname, "../fixtures/coles-pending.csv");
const colesSettledCsv = path.join(__dirname, "../fixtures/coles-settled.csv");
const commbankPdf = path.join(__dirname, "../fixtures/commbank-statement.pdf");
const commbank105Csv = path.join(__dirname, "../fixtures/commbank-105.csv");
const wiseCsv = path.join(__dirname, "../fixtures/wise.csv");
const amexCsv = path.join(__dirname, "../fixtures/amex.csv");
const kiwiBankCsv = path.join(__dirname, "../fixtures/kiwi-bank.csv");

test.describe("Import", () => {
  test.beforeAll(async ({ browser }) => {
    // Create "Import Test Account" via UI if it doesn't exist
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/accounts");
    const exists = await page.getByText("Import Test Account").isVisible();
    if (!exists) {
      await page.getByRole("button", { name: "Add account" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator('input[name="name"]').fill("Import Test Account");
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "CommBank" }).click();
      await dialog.getByRole("button", { name: "Create account" }).click();
      await page.waitForSelector("text=Import Test Account");
    }
    await context.close();
  });

  test("upload CommBank CSV shows preview", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("4 new")).toBeVisible();
    await expect(page.getByText("0 duplicate")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(4);
  });

  test("account default profile is auto-selected and updates on account switch", async ({
    page,
  }) => {
    const commbankAccountName = `Import Auto CommBank ${Date.now()}`;
    const monzoAccountName = `Import Auto Monzo ${Date.now()}`;

    await page.goto("/accounts");

    // Create account with CommBank profile
    await page.getByRole("button", { name: "Add account" }).first().click();
    let accountDialog = page.getByRole("dialog");
    await expect(accountDialog).toBeVisible();
    await accountDialog.locator('input[name="name"]').fill(commbankAccountName);
    await accountDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await accountDialog.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(commbankAccountName)).toBeVisible();

    // Create account with Monzo profile
    await page.getByRole("button", { name: "Add account" }).first().click();
    accountDialog = page.getByRole("dialog");
    await expect(accountDialog).toBeVisible();
    await accountDialog.locator('input[name="name"]').fill(monzoAccountName);
    await accountDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Monzo" }).click();
    await accountDialog.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(monzoAccountName)).toBeVisible();

    await page.goto("/import");

    // Choosing each account should auto-select that account's default profile.
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: commbankAccountName }).click();
    await expect(page.getByRole("combobox").nth(1)).toContainText("CommBank");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: monzoAccountName }).click();
    await expect(page.getByRole("combobox").nth(1)).toContainText("Monzo");
  });

  test("CSV with more than 100 rows imports all on confirm", async ({
    page,
  }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbank105Csv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("105 new")).toBeVisible();
    // Preview table only shows the first 100 rows; full count is in the badge.
    await expect(page.locator("tbody tr")).toHaveCount(100);

    await page
      .getByRole("button", { name: /Import 105 transactions/i })
      .click();
    await expect(page.getByText("Import complete!")).toBeVisible();
    await expect(page.getByText(/105 transactions imported/i)).toBeVisible();
  });

  test("confirm import shows success", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await page.getByRole("button", { name: /Import 4 transactions/i }).click();

    await expect(page.getByText("Import complete!")).toBeVisible();
    await expect(page.getByText(/4 transactions imported/i)).toBeVisible();
  });

  test("accounts page shows freshness after import", async ({ page }) => {
    const accountName = `Import Freshness ${Date.now()}`;

    await page.goto("/accounts");
    await page.getByRole("button", { name: "Add account" }).first().click();
    const accountDialog = page.getByRole("dialog");
    await expect(accountDialog).toBeVisible();
    await accountDialog.locator('input[name="name"]').fill(accountName);
    await accountDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await accountDialog.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(accountName)).toBeVisible();

    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: accountName }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await page.getByRole("button", { name: /Import 4 transactions/i }).click();
    await expect(page.getByText("Import complete!")).toBeVisible();

    await page.goto("/accounts");
    const accountCard = page.locator(".rounded-lg").filter({
      hasText: accountName,
    });
    await expect(accountCard).toContainText(
      /Last import:\s(?!Never imported).+/,
    );
    await expect(accountCard).toContainText(
      /Latest transaction:\s\d{4}-\d{2}-\d{2}/,
    );
  });

  test("import success links to review pending categories", async ({
    page,
  }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    const importBtn = page.getByRole("button", {
      name: /Import \d+ transactions/i,
    });
    await importBtn.waitFor({ state: "visible" });
    test.skip(
      !(await importBtn.isEnabled()),
      "No new rows to import (all duplicates)",
    );

    await importBtn.click();
    await expect(page.getByText("Import complete!")).toBeVisible();
    const link = page.getByRole("link", { name: /Show pending confirmation/i });
    await expect(link).toHaveAttribute("href", "/transactions?needsReview=1");
  });

  test("navigate to transactions after import", async ({ page }) => {
    // The 4 CommBank transactions were imported by "confirm import shows success".
    // Just navigate directly to /transactions and verify the data is there.
    await page.goto("/transactions");
    await expect(page).toHaveURL("/transactions");
    await expect(
      page
        .locator("tbody")
        .getByText("Transfer from xx2407 CommBank app")
        .first(),
    ).toBeVisible();
  });

  test("re-import same file shows all duplicates", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankDupCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("0 new")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Import 0 transactions/i }),
    ).toBeDisabled();
  });

  test("re-import can overwrite duplicates", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankDupCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("0 new")).toBeVisible();
    await page.getByLabel(/Overwrite duplicates/i).check();
    await expect(
      page.getByRole("button", { name: /Import 4 transactions/i }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /Import 4 transactions/i }).click();
    await expect(page.getByText("Import complete!")).toBeVisible();
    await expect(page.getByText(/duplicates overwritten/i)).toBeVisible();
  });

  test("Monzo CSV parses even if wrong profile selected", async ({ page }) => {
    // Intentionally select CommBank while uploading Monzo CSV.
    // The server should auto-detect the correct profile from the CSV header.
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();

    await page.locator("#csv-file").setInputFiles(monzoCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    const importButton = page.getByRole("button", {
      name: /Import \d+ transactions/i,
    });
    await expect(importButton).toBeVisible();
    await expect(importButton).not.toBeDisabled();

    // Ensure we don't end up back on the upload step with an error banner.
    await expect(page.getByText(/No valid rows found/i)).toHaveCount(0);
  });

  test("Coles CSV parses even if wrong profile selected", async ({ page }) => {
    // Intentionally select CommBank while uploading Coles CSV.
    // The server should auto-detect the correct profile from the CSV header.
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();

    await page.locator("#csv-file").setInputFiles(colesCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("4 new")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await expect(page.getByText(/No valid rows found/i)).toHaveCount(0);
  });

  test("Coles pending row merges with later settled row", async ({ page }) => {
    // First import: bring in the pending Coles row (-126.61, no Processed On).
    await page.goto("/import");
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Coles" }).click();
    await page.locator("#csv-file").setInputFiles(colesPendingCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("1 new")).toBeVisible();
    await page.getByRole("button", { name: /Import 1 transactions/i }).click();
    await expect(page.getByText("Import complete!")).toBeVisible();

    // Second import: same merchant + card, settled with a slightly different
    // amount (-127.38, within 10%) and slightly different description.
    // Should be detected as a merge (replace pending) rather than a new row.
    await page.goto("/import");
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Coles" }).click();
    await page.locator("#csv-file").setInputFiles(colesSettledCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("0 new")).toBeVisible();
    await expect(page.getByText("1 merge")).toBeVisible();
    await expect(page.getByText("0 duplicate")).toBeVisible();

    await page.getByRole("button", { name: /Import 1 transactions/i }).click();
    await expect(page.getByText("Import complete!")).toBeVisible();
    await expect(page.getByText(/1 pending settled/i)).toBeVisible();

    // Verify only the settled row remains (no duplicate).
    await page.goto("/transactions");
    const merchantRows = page
      .locator("tbody tr")
      .filter({ hasText: "Coles Online Hawthorn East" });
    await expect(merchantRows).toHaveCount(1);
    await expect(merchantRows.first()).toContainText("Hawthorn East NSW");
    await expect(merchantRows.first()).toContainText("127.38");
  });

  test("CommBank PDF shows preview", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankPdf);
    await page.getByRole("button", { name: "Preview import" }).click();

    // PDF has 11 transactions; some may already be imported — just check preview renders
    await expect(page.locator("tbody tr").first()).toBeVisible();
    // Summary badge shows "{N} new" — unique, unlike individual row badges
    await expect(page.getByText(/\d+ new/)).toBeVisible();
  });

  test("CommBank PDF confirm imports", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();
    await page.locator("#csv-file").setInputFiles(commbankPdf);
    await page.getByRole("button", { name: "Preview import" }).click();

    const importButton = page.getByRole("button", {
      name: /Import \d+ transactions/i,
    });
    if (await importButton.isEnabled()) {
      await importButton.click();
      await expect(page.getByText("Import complete!")).toBeVisible({
        timeout: 15000,
      });
    } else {
      // All 11 rows already imported as duplicates — preview rendered successfully
      await expect(page.getByText("0 new")).toBeVisible();
    }
  });

  test("Wise CSV parses with direction-aware signs", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Wise" }).click();
    await page.locator("#csv-file").setInputFiles(wiseCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("2 new")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await expect(page.getByText("BALANCE_TRANSACTION")).toHaveCount(0);
    // Money in: description uses Source name (not Target / recipient label).
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: "Kanthavel Mayura Vivekananda" }),
    ).toContainText("+");
    await expect(
      page.locator("tbody tr").filter({ hasText: "TransferWise" }),
    ).toContainText("-");
    // "Import Test Account" is AUD, so Wise multi-currency rows should use target amount.
    await expect(
      page.locator("tbody tr").filter({ hasText: "TransferWise" }),
    ).toContainText("10.00");
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: "Kanthavel Mayura Vivekananda" }),
    ).toContainText("USD");
    await expect(
      page.locator("tbody tr").filter({ hasText: "TransferWise" }),
    ).toContainText("AUD");
  });

  test("Amex CSV shows preview", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Amex" }).click();
    await page.locator("#csv-file").setInputFiles(amexCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("2 new")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("Wise CSV auto-detects when wrong profile selected", async ({
    page,
  }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();

    await page.locator("#csv-file").setInputFiles(wiseCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("2 new")).toBeVisible();
    await expect(page.getByText(/No valid rows found/i)).toHaveCount(0);
  });

  test("Amex CSV auto-detects when wrong profile selected", async ({
    page,
  }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();

    await page.locator("#csv-file").setInputFiles(amexCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("2 new")).toBeVisible();
    await expect(page.getByText(/No valid rows found/i)).toHaveCount(0);
  });

  test("Kiwi Bank CSV shows preview", async ({ page }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Kiwi Bank" }).click();
    await page.locator("#csv-file").setInputFiles(kiwiBankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("3 new")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(
      page.locator("tbody tr").filter({ hasText: "E2E Kiwi fixture cafe" }),
    ).toBeVisible();
  });

  test("Kiwi Bank CSV auto-detects when wrong profile selected", async ({
    page,
  }) => {
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "CommBank" }).click();

    await page.locator("#csv-file").setInputFiles(kiwiBankCsv);
    await page.getByRole("button", { name: "Preview import" }).click();

    await expect(page.getByText("3 new")).toBeVisible();
    await expect(page.getByText(/No valid rows found/i)).toHaveCount(0);
  });

  test("Import more resets wizard", async ({ page }) => {
    // Use a dedicated Monzo fixture to exercise a successful import and reset.
    await page.goto("/import");

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Import Test Account" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Monzo" }).click();
    await page.locator("#csv-file").setInputFiles(monzoTransfersCsv);
    await page.getByRole("button", { name: "Preview import" }).click();
    await page
      .getByRole("button", { name: /Import \d+ transactions/i })
      .click();
    await page.waitForSelector("text=Import complete!");

    await page.getByRole("button", { name: "Import more" }).click();
    await expect(page.getByText(/click to upload/i)).toBeVisible();
  });
});
