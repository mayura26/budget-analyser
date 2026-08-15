import { expect, type Page, test } from "@playwright/test";
import Database from "better-sqlite3";

async function createAnalyticsTestAccount(page: Page) {
  const accountName = `Analytics Merchants ${Date.now()} ${Math.random()
    .toString(36)
    .slice(2)}`;
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(accountName);
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "CommBank" }).click();
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(accountName)).toBeVisible();

  return accountName;
}

async function deleteAnalyticsTestAccount(page: Page, accountName: string) {
  await page.goto("/accounts");
  const card = page.locator(".rounded-lg").filter({ hasText: accountName });
  if (
    !(await card
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false))
  ) {
    return;
  }
  await card.first().locator("button:has(.lucide-trash-2)").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "hidden" });
}

type BudgetTargetRestore = {
  id: number;
  previousTargetAmount: number | null;
};

function setAnalyticsBudgetTarget(
  month: string,
  categoryName: string,
  amount: number,
): BudgetTargetRestore {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    const category = sqlite
      .prepare("SELECT id FROM categories WHERE name = ? LIMIT 1")
      .get(categoryName) as { id: number } | undefined;
    if (!category) throw new Error(`Category not found: ${categoryName}`);

    const existing = sqlite
      .prepare(
        `SELECT id, target_amount AS targetAmount
         FROM budgets
         WHERE month = ? AND category_id = ?`,
      )
      .get(month, category.id) as
      | { id: number; targetAmount: number }
      | undefined;

    if (existing) {
      sqlite
        .prepare(
          `UPDATE budgets
           SET target_amount = ?, updated_at = unixepoch()
           WHERE id = ?`,
        )
        .run(amount, existing.id);
      return { id: existing.id, previousTargetAmount: existing.targetAmount };
    }

    const budget = sqlite
      .prepare(
        `INSERT INTO budgets
           (month, category_id, target_amount, created_at, updated_at)
         VALUES (?, ?, ?, unixepoch(), unixepoch())`,
      )
      .run(month, category.id, amount);
    return { id: Number(budget.lastInsertRowid), previousTargetAmount: null };
  } finally {
    sqlite.close();
  }
}

function cleanupAnalyticsBudgetTargets(restores: BudgetTargetRestore[]) {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    for (const restore of restores) {
      if (restore.previousTargetAmount === null) {
        sqlite.prepare("DELETE FROM budgets WHERE id = ?").run(restore.id);
      } else {
        sqlite
          .prepare(
            `UPDATE budgets
             SET target_amount = ?, updated_at = unixepoch()
             WHERE id = ?`,
          )
          .run(restore.previousTargetAmount, restore.id);
      }
    }
  } finally {
    sqlite.close();
  }
}

test.describe("Analytics", () => {
  test("page heading and period control render", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.getByRole("heading", { name: "Analytics" }),
    ).toBeVisible();
    await expect(page.getByLabel("Period")).toBeVisible();
  });

  test("main sections render", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByText(/Cashflow by month/i)).toBeVisible();
    await expect(page.getByText(/By account/i)).toBeVisible();
    // Category explorer is now a single tabbed card; Spending is the default.
    await expect(page.getByRole("tab", { name: "Spending" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Income" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Savings" })).toBeVisible();
    await expect(page.getByText(/Spending by category/i)).toBeVisible();
  });

  test("shows repeated wants merchants", async ({ page }) => {
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createAnalyticsTestAccount(page);

    try {
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 7,
          reset: true,
          seedMonth,
          categoryName: "Activities (dining, events, hobbies)",
          merchant: "McDonalds",
          description: "E2E McDonalds analytics",
          amount: -300,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.goto(
        `/analytics?preset=custom&from=${seedMonth}-01&to=${seedMonth}-28`,
      );
      const card = page.getByTestId("top-merchants-card");
      await expect(card.getByText("Merchant signals")).toBeVisible();
      const row = card
        .getByTestId("top-merchant-row")
        .filter({
          hasText: "McDonalds",
        })
        .first();
      await expect(row).toBeVisible();
      await expect(row.getByText(/7x.*avg/)).toBeVisible();
      await expect(row.getByText("Critical", { exact: true })).toBeVisible();
      await expect(row.getByText("Frequent")).toBeVisible();
    } finally {
      await deleteAnalyticsTestAccount(page, accountName);
    }
  });

  test("only shows one-off wants merchants when they dominate their category", async ({
    page,
  }) => {
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createAnalyticsTestAccount(page);
    const budgetTargets: BudgetTargetRestore[] = [];

    try {
      budgetTargets.push(
        setAnalyticsBudgetTarget(
          seedMonth,
          "Activities (dining, events, hobbies)",
          1000,
        ),
        setAnalyticsBudgetTarget(
          seedMonth,
          "Shopping (clothes, random purchases)",
          1000,
        ),
      );

      const dominant = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 1,
          reset: true,
          seedMonth,
          categoryName: "Activities (dining, events, hobbies)",
          merchant: "E2E One Off Feast",
          description: "E2E one off feast",
          amount: -410,
        },
      });
      expect(dominant.ok()).toBeTruthy();

      const repeated = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 2,
          reset: false,
          seedMonth,
          categoryName: "Activities (dining, events, hobbies)",
          merchant: "E2E Regular Dining",
          description: "E2E regular dining",
          amount: -400,
        },
      });
      expect(repeated.ok()).toBeTruthy();

      const smallOneOff = await page.request.post(
        "/api/test-seed-transactions",
        {
          data: {
            accountName,
            count: 1,
            reset: false,
            seedMonth,
            categoryName: "Shopping (clothes, random purchases)",
            merchant: "E2E One Off Socks",
            description: "E2E one off socks",
            amount: -100,
          },
        },
      );
      expect(smallOneOff.ok()).toBeTruthy();

      const shoppingBaseline = await page.request.post(
        "/api/test-seed-transactions",
        {
          data: {
            accountName,
            count: 2,
            reset: false,
            seedMonth,
            categoryName: "Shopping (clothes, random purchases)",
            merchant: "E2E Regular Shopping",
            description: "E2E regular shopping",
            amount: -450,
          },
        },
      );
      expect(shoppingBaseline.ok()).toBeTruthy();

      await page.goto(
        `/analytics?preset=custom&from=${seedMonth}-01&to=${seedMonth}-28`,
      );
      const card = page.getByTestId("top-merchants-card");
      const row = card
        .getByTestId("top-merchant-row")
        .filter({
          hasText: "E2E One Off Feast",
        })
        .first();
      await expect(row).toBeVisible();
      await expect(
        row.getByText("Critical", { exact: true }).first(),
      ).toBeVisible();
      await expect(row.getByText("Budget share").first()).toBeVisible();
      await expect(row.getByText(/of category budget/).first()).toBeVisible();
    } finally {
      cleanupAnalyticsBudgetTargets(budgetTargets);
      await deleteAnalyticsTestAccount(page, accountName);
    }
  });
  test("category tabs swap content", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("tab", { name: "Spending" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.getByRole("tab", { name: "Income" }).click();
    await expect(page.getByText(/Income by category/i)).toBeVisible();
    await page.getByRole("tab", { name: "Savings" }).click();
    await expect(page.getByText(/Savings & investments/i)).toBeVisible();
  });

  test("view all transactions link is in the header", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.getByRole("link", { name: /View all transactions in this period/i }),
    ).toBeVisible();
  });

  test("preset navigation updates URL", async ({ page }) => {
    await page.goto("/analytics");
    await page.getByLabel("Period").click();
    await page.getByRole("option", { name: /Year to date/i }).click();
    await expect(page).toHaveURL(/preset=ytd/);
  });

  test("spending by category describes expand behavior", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.getByText(
        /Expand a category to see subcategories and transactions/i,
      ),
    ).toBeVisible();
  });

  test("category expand toggles aria-expanded when data exists", async ({
    page,
  }) => {
    await page.goto("/analytics");
    const expandBtn = page.getByRole("button", { name: /^Expand / });
    const count = await expandBtn.count();
    test.skip(
      count === 0,
      "No expandable category rows (no spending data in period)",
    );
    const first = expandBtn.first();
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });
});
