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
const commbankPdf = path.join(__dirname, "../fixtures/commbank-statement.pdf");

test.describe("Import", () => {
  test.beforeAll(async ({ browser }) => {
    // Create "Import Test Account" via UI if it doesn't exist
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/accounts");
    const exists = await page.getByText("Import Test Account").isVisible();
    if (!exists) {
      await page.getByRole("button", { name: "Add account" }).click();
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
