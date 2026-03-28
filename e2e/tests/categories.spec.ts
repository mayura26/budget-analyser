import { join } from "node:path";
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { parseCategoryDisplayName } from "@/lib/categories/display-name";

test.describe("Categories", () => {
  test("seeded main groups and sub-categories render", async ({ page }) => {
    await page.goto("/categories");
    await expect(
      page.getByRole("heading", { name: "Living Costs" }),
    ).toBeVisible();
    await expect(page.getByText("Groceries").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Money IN" })).toBeVisible();
    await expect(
      page.getByText("Income", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("salary / primary", { exact: true }).first(),
    ).toBeVisible();
  });

  test("rule count shown on sub-category card", async ({ page }) => {
    await page.goto("/categories");
    const groceriesCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Groceries" })
      .first();
    await expect(groceriesCard.getByText(/\d+ rule/i)).toBeVisible();
  });

  test("expand and collapse sub-category card", async ({ page }) => {
    await page.goto("/categories");
    await page.getByText("Groceries").first().click();
    await expect(page.getByText("Matching rules")).toBeVisible();
    await page.getByText("Groceries").first().click();
    await expect(page.getByText("Matching rules")).not.toBeVisible();
  });

  test("add sub-category", async ({ page }) => {
    await page.goto("/categories");
    await page.getByRole("button", { name: "Add sub-category" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Living Costs" }).click();
    await dialog.locator('input[name="title"]').fill("E2E Category");
    await dialog.locator('textarea[name="subtext"]').fill("e2e ai hint");

    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("E2E Category").first()).toBeVisible();
    await expect(page.getByText("e2e ai hint").first()).toBeVisible();
    await expect(page.getByText("Expense").first()).toBeVisible();
  });

  test("add rule to sub-category", async ({ page }) => {
    await page.goto("/categories");
    await page.getByText("E2E Category").first().click();
    await page.getByRole("button", { name: "Add rule" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="pattern"]').fill("TESTMERCHANT");
    await dialog.getByRole("button", { name: "Add rule" }).click();

    await expect(page.getByText("TESTMERCHANT")).toBeVisible();
    await expect(page.getByText("keyword").first()).toBeVisible();
  });

  test("delete rule", async ({ page }) => {
    await page.goto("/categories");
    await page.getByText("E2E Category").first().click();
    const ruleRow = page
      .locator("div")
      .filter({ hasText: /^keyword.*TESTMERCHANT/ })
      .first();
    await ruleRow.locator("button").click();
    await expect(page.getByText("TESTMERCHANT")).not.toBeVisible();
  });

  test("delete non-system sub-category", async ({ page }) => {
    await page.goto("/categories");
    const e2eCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "E2E Category" })
      .first();
    await e2eCard.locator("button:has(.lucide-trash-2)").click();
    await expect(page.getByText("E2E Category")).not.toBeVisible();
  });

  test("repair orphan sub-category via edit", async ({ page }) => {
    await page.goto("/categories");
    await expect(
      page.getByRole("heading", { name: "Living Costs" }),
    ).toBeVisible();

    const dbPath = join(process.cwd(), "data", "test.db");
    const db = new Database(dbPath);
    const mainRow = db
      .prepare(
        "SELECT id FROM categories WHERE name = 'Living Costs' AND parent_id IS NULL",
      )
      .get() as { id: number } | undefined;
    if (!mainRow) throw new Error("Living Costs missing");
    const subs = db
      .prepare(
        "SELECT id, name FROM categories WHERE parent_id = ? ORDER BY name LIMIT 2",
      )
      .all(mainRow.id) as { id: number; name: string }[];
    if (subs.length < 2) {
      throw new Error("Need two sub-categories under Living Costs");
    }
    db.prepare("UPDATE categories SET parent_id = ? WHERE id = ?").run(
      subs[1].id,
      subs[0].id,
    );
    db.close();

    await page.reload();
    await expect(
      page.getByText(/Sub-categories with missing parent/),
    ).toBeVisible();

    const orphanTitle = parseCategoryDisplayName(subs[0].name).title;
    const banner = page
      .getByText(/Sub-categories with missing parent/)
      .locator("..");
    const orphanRow = banner.locator("li").filter({ hasText: orphanTitle });
    await orphanRow.locator("button").first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Living Costs" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(
      page.getByText(/Sub-categories with missing parent/),
    ).toHaveCount(0);
  });

  test("built-in sub-category delete confirms and removes", async ({
    page,
  }) => {
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("built-in");
      dialog.accept();
    });
    await page.goto("/categories");
    const groceriesCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Groceries" })
      .first();
    await groceriesCard.locator("button:has(.lucide-trash-2)").click();
    await expect(page.getByText("Groceries").first()).not.toBeVisible();
  });
});
