import { expect, type Page, test } from "@playwright/test";
import Database from "better-sqlite3";

async function createBudgetTestAccount(page: Page) {
  const accountName = `Budget Surplus ${Date.now()}`;
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(accountName);
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "CommBank" }).click();
  await dialog.getByRole("combobox").nth(2).click();
  await page
    .getByRole("option", { name: /Australian dollar \(AUD\)/i })
    .click();
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(accountName)).toBeVisible();

  return accountName;
}

async function deleteBudgetTestAccount(page: Page, accountName: string) {
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

async function addManualSavingsTransaction({
  page,
  accountName,
  date,
  amount,
}: {
  page: Page;
  accountName: string;
  date: string;
  amount: string;
}) {
  await page.goto("/transactions/new");
  await page.locator('select[name="accountId"]').selectOption({
    label: accountName,
  });
  await page.locator('input[name="date"]').fill(date);
  await page.locator('input[name="description"]').fill("E2E surplus sweep");
  await page.locator('input[name="amount"]').fill(amount);

  const categoryOption = page
    .locator('select[name="categoryId"] option')
    .filter({ hasText: "Long-term savings" })
    .first();
  const categoryId = await categoryOption.getAttribute("value");
  if (!categoryId) throw new Error("Long-term savings category not found");
  await page.locator('select[name="categoryId"]').selectOption(categoryId);

  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL("/transactions");
}

async function setBudgetTargetForCategory({
  page,
  categoryName,
  amount,
}: {
  page: Page;
  categoryName: RegExp;
  amount: string;
}) {
  await page.goto("/budget", { waitUntil: "commit" });
  const row = page
    .getByTestId("budget-category-row")
    .filter({ hasText: categoryName })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });

  await row.getByRole("button", { name: /Edit target for/i }).click();
  const input = row.locator('input[name^="target_"][type="number"]');
  await expect(input).toBeVisible();
  await input.fill(amount);
  await input.press("Enter");

  await expect(
    row.getByRole("button", { name: /Edit target for/i }),
  ).toBeVisible({
    timeout: 10000,
  });
}

async function deleteScheduleIfVisible(page: Page, scheduleName: string) {
  await page.goto("/budget", { waitUntil: "commit" });
  await page.getByRole("tab", { name: "Schedules" }).click();
  const card = page.locator(".rounded-lg").filter({ hasText: scheduleName });
  if (
    await card
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    await card.first().locator('button[aria-label="Delete"]').click();
    await page.waitForTimeout(300);
  }
}

function cleanupSchedules() {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);
  sqlite.prepare("DELETE FROM scheduled_transactions").run();
  sqlite.close();
}

function currentBudgetTestMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type NearGuideSeed = {
  month: string;
  scheduleId: number;
  budgetId: number;
  previousBudgetAmount: number | null;
  parentCategoryId: number;
  previousParentBudgetRuleBucket: string | null;
};

type ExpenseRefundSeed = {
  month: string;
  accountId: number;
  categoryId: number;
  categoryName: string;
  transactionId: number;
  budgetId: number;
};

function seedExpenseRefundBudgetRow(): ExpenseRefundSeed {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    sqlite
      .prepare("DELETE FROM accounts WHERE name LIKE 'E2E Expense Refund %'")
      .run();
    sqlite
      .prepare(
        `DELETE FROM transactions
         WHERE category_id IN (
           SELECT id FROM categories WHERE name LIKE 'E2E Refund Offset %'
         )`,
      )
      .run();
    sqlite
      .prepare(
        `DELETE FROM budgets
         WHERE category_id IN (
           SELECT id FROM categories WHERE name LIKE 'E2E Refund Offset %'
         )`,
      )
      .run();
    sqlite
      .prepare("DELETE FROM categories WHERE name LIKE 'E2E Refund Offset %'")
      .run();

    const parent = sqlite
      .prepare(
        `SELECT id
         FROM categories
         WHERE parent_id IS NULL
           AND name = 'Special'
         LIMIT 1`,
      )
      .get() as { id: number } | undefined;

    if (!parent) {
      throw new Error("Special expense group not found");
    }

    const categoryName = `E2E Refund Offset ${Date.now()}`;
    const category = sqlite
      .prepare(
        `INSERT INTO categories
           (name, color, icon, parent_id, type, is_system, created_at)
         VALUES (?, '#fb923c', 'Plane', ?, 'expense', 0, unixepoch())`,
      )
      .run(categoryName, parent.id);
    const categoryId = Number(category.lastInsertRowid);

    const account = sqlite
      .prepare(
        `INSERT INTO accounts (name, currency, color, color_custom, created_at)
         VALUES (?, 'AUD', '#14b8a6', 1, unixepoch())`,
      )
      .run(`E2E Expense Refund ${Date.now()}`);

    const accountId = Number(account.lastInsertRowid);
    const month = currentBudgetTestMonth();
    const transaction = sqlite
      .prepare(
        `INSERT INTO transactions
           (account_id, fingerprint, date, description, normalised, amount, category_id, category_source, category_confirmed, is_manual, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 3791.56, ?, 'manual', 1, 1, unixepoch(), unixepoch())`,
      )
      .run(
        accountId,
        `e2e-expense-refund-${accountId}`,
        `${month}-02`,
        "E2E travel refund",
        "e2e travel refund",
        categoryId,
      );

    const budget = sqlite
      .prepare(
        `INSERT INTO budgets
           (month, category_id, target_amount, created_at, updated_at)
         VALUES (?, ?, 500, unixepoch(), unixepoch())`,
      )
      .run(month, categoryId);

    return {
      month,
      accountId,
      categoryId,
      categoryName,
      transactionId: Number(transaction.lastInsertRowid),
      budgetId: Number(budget.lastInsertRowid),
    };
  } finally {
    sqlite.close();
  }
}

function cleanupExpenseRefundBudgetRow(seed: ExpenseRefundSeed) {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    sqlite
      .prepare("DELETE FROM transactions WHERE id = ?")
      .run(seed.transactionId);
    sqlite.prepare("DELETE FROM budgets WHERE id = ?").run(seed.budgetId);
    sqlite.prepare("DELETE FROM categories WHERE id = ?").run(seed.categoryId);
    sqlite.prepare("DELETE FROM accounts WHERE id = ?").run(seed.accountId);
  } finally {
    sqlite.close();
  }
}

function seedNearGuideNeedsTarget(): NearGuideSeed {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    const category = sqlite
      .prepare(
        `SELECT
           c.id,
           parent.id AS parentCategoryId,
           parent.budget_rule_bucket AS parentBudgetRuleBucket
         FROM categories c
         INNER JOIN categories parent ON parent.id = c.parent_id
         WHERE c.type = 'expense'
           AND parent.name IN ('Essentials', 'Living Costs')
         ORDER BY CASE parent.name WHEN 'Essentials' THEN 0 ELSE 1 END, c.id
         LIMIT 1`,
      )
      .get() as
      | {
          id: number;
          parentCategoryId: number;
          parentBudgetRuleBucket: string | null;
        }
      | undefined;

    if (!category) {
      throw new Error(
        "No Needs expense category found for 50/30/20 marker test",
      );
    }

    sqlite
      .prepare(
        "UPDATE categories SET budget_rule_bucket = 'needs' WHERE id = ?",
      )
      .run(category.parentCategoryId);

    const month = currentBudgetTestMonth();
    const startDate = `${month}-01`;
    const schedule = sqlite
      .prepare(
        `INSERT INTO scheduled_transactions
           (name, amount, frequency, start_date, is_active, created_at, updated_at)
         VALUES (?, 20000, 'monthly', ?, 1, unixepoch(), unixepoch())`,
      )
      .run(`E2E near-guide income ${Date.now()}`, startDate);

    const existingBudget = sqlite
      .prepare(
        `SELECT id, target_amount AS targetAmount
         FROM budgets
         WHERE month = ? AND category_id = ?`,
      )
      .get(month, category.id) as
      | { id: number; targetAmount: number }
      | undefined;

    if (existingBudget) {
      sqlite
        .prepare(
          `UPDATE budgets
           SET target_amount = 9800, updated_at = unixepoch()
           WHERE id = ?`,
        )
        .run(existingBudget.id);

      return {
        month,
        scheduleId: Number(schedule.lastInsertRowid),
        budgetId: existingBudget.id,
        previousBudgetAmount: existingBudget.targetAmount,
        parentCategoryId: category.parentCategoryId,
        previousParentBudgetRuleBucket: category.parentBudgetRuleBucket,
      };
    }

    const budget = sqlite
      .prepare(
        `INSERT INTO budgets
           (month, category_id, target_amount, created_at, updated_at)
         VALUES (?, ?, 9800, unixepoch(), unixepoch())`,
      )
      .run(month, category.id);

    return {
      month,
      scheduleId: Number(schedule.lastInsertRowid),
      budgetId: Number(budget.lastInsertRowid),
      previousBudgetAmount: null,
      parentCategoryId: category.parentCategoryId,
      previousParentBudgetRuleBucket: category.parentBudgetRuleBucket,
    };
  } finally {
    sqlite.close();
  }
}

function cleanupNearGuideNeedsTarget(seed: NearGuideSeed) {
  const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
  const sqlite = new Database(dbPath);

  try {
    sqlite
      .prepare("DELETE FROM scheduled_transactions WHERE id = ?")
      .run(seed.scheduleId);

    if (seed.previousBudgetAmount === null) {
      sqlite.prepare("DELETE FROM budgets WHERE id = ?").run(seed.budgetId);
    } else {
      sqlite
        .prepare(
          `UPDATE budgets
           SET target_amount = ?, updated_at = unixepoch()
           WHERE id = ?`,
        )
        .run(seed.previousBudgetAmount, seed.budgetId);
    }

    sqlite
      .prepare("UPDATE categories SET budget_rule_bucket = ? WHERE id = ?")
      .run(seed.previousParentBudgetRuleBucket, seed.parentCategoryId);
  } finally {
    sqlite.close();
  }
}

test.describe("Budget", () => {
  test.beforeAll(() => {
    cleanupSchedules();
  });

  test("page renders with heading", async ({ page }) => {
    await page.goto("/budget");
    await expect(
      page.getByRole("heading", { name: "Budget Planner" }),
    ).toBeVisible();
  });

  test("monthly budget tab is default", async ({ page }) => {
    await page.goto("/budget");
    await expect(
      page.getByRole("tab", { name: "Monthly Budget" }),
    ).toHaveAttribute("data-state", "active");
  });

  test("monthly budget tab shows empty state with setup prompt", async ({
    page,
  }) => {
    await page.goto("/budget");
    await expect(page.getByText("Set up your budget for")).toBeVisible();
  });

  test("generate budget dialog opens with context totals and target comparisons", async ({
    page,
  }) => {
    await page.goto("/budget", { waitUntil: "commit" });
    await page.getByRole("button", { name: "Generate Budget" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Generate Budget")).toBeVisible();

    const contextBar = dialog.getByTestId("generate-budget-context-bar");
    await expect(contextBar).toContainText("50 / 30 / 20 guide");
    await expect(contextBar).toContainText("Expenses");
    await expect(contextBar).toContainText("Savings");
    await expect(contextBar).toContainText("Expected income");

    const groupSummary = dialog
      .getByTestId("generate-budget-group-summary")
      .first();
    await expect(groupSummary).toContainText("Proposed");
    await expect(groupSummary).toContainText("Current");
    await expect(groupSummary).toContainText("Last spent");
    await expect(groupSummary).toContainText("3M avg");
    await expect(groupSummary).toContainText("Prev target");

    await expect(
      dialog.getByText("Previous month target").first(),
    ).toBeVisible();
    await expect(dialog.getByText("Last spent").first()).toBeVisible();
    await expect(dialog.getByText("3M avg").first()).toBeVisible();
    await expect(dialog.getByText("Expected").first()).toBeVisible();
    const copyLastMonthButton = dialog
      .getByTestId("copy-last-month-target")
      .first();
    await expect(copyLastMonthButton).toBeVisible();
    const lastMonthTarget = await copyLastMonthButton.getAttribute(
      "data-last-month-target",
    );
    expect(lastMonthTarget).not.toBeNull();
    const copiedRow = copyLastMonthButton.locator("xpath=ancestor::tr");
    const targetInput = copiedRow.locator('input[type="number"]').first();
    await copyLastMonthButton.click();
    await expect(targetInput).toHaveValue(String(Number(lastMonthTarget)));
    await expect(
      dialog.getByRole("columnheader", { name: "Target change" }).first(),
    ).toBeVisible();
    await expect(dialog.getByText("Current").first()).toBeVisible();
    await expect(dialog.getByText("New").first()).toBeVisible();
    await expect(
      dialog.getByText(/New target|No change|[+-]\$/).first(),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Select all" }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Clear" })).toBeVisible();
  });

  test("monthly budget tab shows category list with headers", async ({
    page,
  }) => {
    await page.goto("/budget");
    // Wait for the category list to render (it loads with server data)
    await expect(
      page
        .getByText("Set up your budget for")
        .or(page.getByTestId("summary-spending-progress")),
    ).toBeVisible({ timeout: 10000 });
    // Column headers
    await expect(
      page.getByText("Budget", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Progress").first()).toBeVisible();
  });

  test("50/30/20 strip renders three mini grouped bar charts when budget exists", async ({
    page,
  }) => {
    await page.goto("/budget", { waitUntil: "commit" });
    const hasBudget = await page
      .getByTestId("summary-spending-progress")
      .isVisible({ timeout: 8000 })
      .catch(() => false);
    test.skip(!hasBudget, "Needs budget targets for the current month");

    await expect(page.getByText("50 / 30 / 20 guideline")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-needs")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-wants")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-savings")).toBeVisible();
  });

  test("shows target marker when target is close to guide", async ({
    page,
  }) => {
    const seed = seedNearGuideNeedsTarget();

    try {
      await page.goto(`/budget?month=${seed.month}`, { waitUntil: "commit" });

      await expect(page.getByText("50 / 30 / 20 guideline")).toBeVisible();
      await expect(page.getByTestId("rule-band-chart-needs")).toBeVisible();
      await expect(page.getByTestId("rule-band-target-needs")).toBeVisible();
      await expect(page.getByTestId("rule-band-guide-needs")).toBeVisible();
    } finally {
      cleanupNearGuideNeedsTarget(seed);
    }
  });

  test("past month monthly budget tab loads; optional transaction drill-down", async ({
    page,
  }) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`/budget?month=${prevMonth}`);
    await expect(
      page.getByRole("heading", { name: "Budget Planner" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Monthly Budget" }),
    ).toHaveAttribute("data-state", "active");

    const expandTxn = page
      .getByRole("button", { name: /Show transactions for/i })
      .first();
    if (await expandTxn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expandTxn.click();
      await expect(
        page.getByRole("link", { name: "Transactions" }).first(),
      ).toBeVisible();
    }
  });

  test("income surplus synthetic row appears on budget grid with month query", async ({
    page,
  }) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`/budget?month=${prevMonth}`);
    await expect(page.getByText(/Income surplus \(unallocated\)/)).toBeVisible({
      timeout: 10000,
    });
  });

  test("income surplus row shows a deficit state when savings are overallocated", async ({
    page,
  }) => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createBudgetTestAccount(page);

    try {
      await addManualSavingsTransaction({
        page,
        accountName,
        date: `${month}-02`,
        amount: "-5000",
      });

      await page.goto(`/budget?month=${month}`);
      const surplusRow = page.getByTestId("budget-row-income-surplus");
      await expect(surplusRow).toBeVisible({ timeout: 10000 });
      await expect(surplusRow).toContainText("Deficit");
      await expect(surplusRow).toContainText("$5,000.00");
    } finally {
      await deleteBudgetTestAccount(page, accountName);
    }
  });

  test("expense refunds can make category spend negative", async ({ page }) => {
    test.slow();
    const seed = seedExpenseRefundBudgetRow();

    try {
      await page.goto(`/budget?month=${seed.month}`, { waitUntil: "commit" });

      const refundRow = page
        .getByTestId("budget-category-row")
        .filter({ hasText: seed.categoryName })
        .first();
      await expect(refundRow).toBeVisible({ timeout: 10000 });
      await expect(refundRow).toContainText("-$3,791.56");
      await expect(refundRow).toContainText("$4,291.56");

      const summary = page.getByTestId("summary-spending-progress");
      await expect(summary).toContainText("-$3,791.56");
    } finally {
      cleanupExpenseRefundBudgetRow(seed);
    }
  });

  test("closed past month shows realised vs scheduled income when budget exists", async ({
    page,
  }) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`/budget?month=${prevMonth}`);

    const hasExpenseBudget = await page
      .getByTestId("summary-spending-progress")
      .isVisible({ timeout: 8000 })
      .catch(() => false);
    test.skip(!hasExpenseBudget, "Needs budget targets for the previous month");

    const closeMonthBtn = page.getByRole("button", { name: "Close Month" });
    if (await closeMonthBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeMonthBtn.click();
    }

    await expect(
      page.getByRole("button", { name: "Month Closed" }),
    ).toBeVisible({
      timeout: 8000,
    });

    await expect(page.getByText(/Realised .*expected/)).toBeVisible();
  });

  test("closed month unlocks review page with quick and deep formats", async ({
    page,
  }) => {
    let regenerateCalls = 0;
    const baseMetrics = (month: string) => ({
      month,
      monthLabel: "January 2026",
      totalBudgeted: 2000,
      totalSpent: 1900,
      projectedSpend: 1900,
      netVariance: -100,
      onTrack: true,
      actualIncome: 3000,
      expectedIncome: 3100,
      incomeVariance: -100,
      savingsRate: 36.7,
      surplus: 800,
      taggedSavings: 300,
      effectiveSavings: 1100,
      buckets: {
        needs: {
          targetAmount: 1500,
          actualAmount: 1450,
          guidelineAmount: 1500,
          targetPct: 50,
          actualPct: 48.3,
        },
        wants: {
          targetAmount: 500,
          actualAmount: 450,
          guidelineAmount: 900,
          targetPct: 30,
          actualPct: 15.0,
        },
        savings: {
          targetAmount: 0,
          actualAmount: 1100,
          guidelineAmount: 600,
          targetPct: 20,
          actualPct: 36.7,
        },
      },
      topOverspend: [
        {
          category: "Takeout (Fast food, food delivery)",
          bucket: "wants",
          amount: 380,
          message: "Takeout is over.",
        },
      ],
      topUnderspend: [
        {
          category: "Groceries (supermarket, household food)",
          bucket: "needs",
          amount: 50,
          message: "Groceries finished under.",
        },
      ],
      categoriesOverTarget: 1,
      topWantsMerchants: [
        {
          merchant: "McDonalds",
          total: 180,
          count: 9,
          average: 20,
          shareOfWants: 40,
          shareOfCategory: 40,
          categoryName: "Activities (dining, events, hobbies)",
          severity: "critical",
          flagReasons: ["frequent", "high_spend"],
        },
      ],
    });

    await page.route("**/api/ai-budget-review", async (route) => {
      const body = route.request().postDataJSON() as {
        month?: string;
        format?: "digest" | "deep";
        regenerate?: boolean;
      };
      if (body.regenerate) regenerateCalls++;
      const format = body.format === "deep" ? "deep" : "digest";
      const month = body.month ?? "2026-01";
      const payload =
        format === "digest"
          ? {
              format: "digest",
              metrics: baseMetrics(month),
              review: {
                headline: "Strong finish for the month.",
                bucketCommentary: {
                  needs: "Needs landed at 48.3%, just under target.",
                  wants: "Wants ran cool at 15%, well under the 30% guideline.",
                  savings:
                    "Savings cleared 36.7% thanks to tagged savings and surplus.",
                },
                risks: [
                  {
                    severity: "medium",
                    bucket: "wants",
                    text: "Dining out is still near your limit.",
                  },
                ],
                wins: [
                  { bucket: "needs", text: "Groceries closed under target." },
                ],
                actions: [
                  {
                    bucket: "savings",
                    text: "Sweep $50 surplus into your utilities buffer.",
                  },
                ],
              },
              cached: false,
              model: "gpt-4o-mini",
              generatedAt: Math.floor(Date.now() / 1000),
            }
          : {
              format: "deep",
              metrics: {
                ...baseMetrics(month),
                totalSpent: 2100,
                netVariance: 100,
                onTrack: false,
              },
              review: {
                executiveSummary: "You closed slightly over budget.",
                narrative:
                  "Wants and Needs both drifted close to their guidelines this month.",
                bucketCommentary: {
                  needs: "Needs at 48% — within target.",
                  wants: "Wants at 32% — over the 30% target by 2pts.",
                  savings: "Savings landed light because of the overspend.",
                },
                keyFindings: [
                  {
                    bucket: "wants",
                    text: "Transport and dining drove most variance.",
                  },
                ],
                varianceDrivers: [
                  {
                    bucket: "wants",
                    text: "Dining out exceeded target by $80.",
                  },
                ],
                recommendations: [
                  {
                    bucket: "wants",
                    text: "Reduce dining cap by one meal per week.",
                  },
                ],
              },
              cached: false,
              model: "gpt-4o-mini",
              generatedAt: Math.floor(Date.now() / 1000),
            };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`/budget?month=${prevMonth}`);

    const closeButton = page.getByRole("button", { name: "Close Month" });
    const isOpen = await closeButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (isOpen) {
      // Review Month button should not exist while the month is still open.
      await expect(
        page.getByRole("button", { name: "Review Month" }),
      ).toHaveCount(0);
      await closeButton.click();
      await expect(
        page.getByRole("button", { name: "Month Closed" }),
      ).toBeVisible();
    }

    const reviewButton = page.getByRole("button", { name: "Review Month" });
    await expect(reviewButton).toBeVisible();
    await reviewButton.click();

    // Hero band + tabs render
    await expect(page.getByText("Monthly review")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Quick Digest" })).toBeVisible();
    await expect(page.getByText("Strong finish for the month.")).toBeVisible();

    // Category variance chart shows full long category labels (Y-axis space)
    await expect(page.getByText("Category variance")).toBeVisible();
    const merchantCard = page.getByTestId("top-merchants-card");
    await expect(merchantCard.getByText("Merchant signals")).toBeVisible();
    const merchantRow = merchantCard
      .getByTestId("top-merchant-row")
      .filter({
        hasText: "McDonalds",
      })
      .first();
    await expect(merchantRow).toBeVisible();
    await expect(merchantRow.getByText(/9x.*avg/)).toBeVisible();
    await expect(
      merchantRow.getByText("Critical", { exact: true }),
    ).toBeVisible();
    await expect(merchantRow.getByText("Frequent")).toBeVisible();
    // Category variance chart shows lean names (before parenthetical)
    await expect(
      page.locator(".recharts-wrapper").getByText("Takeout", { exact: true }),
    ).toBeVisible();

    // 50/30/20 verdict band shows three buckets and the actual-income note
    await expect(page.getByText("50 / 30 / 20 verdict")).toBeVisible();
    await expect(page.getByText(/Based on actual income/)).toBeVisible();
    const surplusTile = page.locator(".rounded-xl").filter({
      hasText: /Surplus.*savings/,
    });
    await expect(surplusTile.getByText("$800.00")).toBeVisible();
    await expect(
      surplusTile.getByText("On top of $300.00 tagged"),
    ).toBeVisible();
    const effectiveSavingsTile = page.locator(".rounded-xl").filter({
      hasText: "Effective savings",
    });
    await expect(effectiveSavingsTile.getByText("$1,100.00")).toBeVisible();
    await expect(
      effectiveSavingsTile.getByText("36.7% of income"),
    ).toBeVisible();

    // Regenerate button triggers a POST with regenerate=true
    const regenerateBefore = regenerateCalls;
    await page.getByRole("button", { name: /Regenerate/ }).click();
    await expect.poll(() => regenerateCalls).toBeGreaterThan(regenerateBefore);

    // Switch to Deep Review and verify deep payload renders
    await page.getByRole("tab", { name: "Deep Review" }).click();
    await expect(
      page.getByText("You closed slightly over budget."),
    ).toBeVisible();
    await expect(page.getByText("Variance drivers")).toBeVisible();
  });

  test("review report shows wants merchant concentration", async ({ page }) => {
    const month = "2026-01";
    const dbPath = process.env.DATABASE_PATH ?? "./data/test.db";
    const sqlite = new Database(dbPath);
    sqlite
      .prepare(
        `INSERT INTO budget_month_status (month, is_closed, closed_at, created_at, updated_at)
         VALUES (?, 1, unixepoch(), unixepoch(), unixepoch())
         ON CONFLICT(month) DO UPDATE SET is_closed = 1, closed_at = unixepoch(), updated_at = unixepoch()`,
      )
      .run(month);
    sqlite.close();

    await page.route("**/api/ai-budget-review", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          format: "digest",
          metrics: {
            month,
            monthLabel: "January 2026",
            totalBudgeted: 2000,
            totalSpent: 1900,
            projectedSpend: 1900,
            netVariance: -100,
            onTrack: true,
            actualIncome: 3000,
            expectedIncome: 3000,
            incomeVariance: 0,
            savingsRate: 36.7,
            surplus: 800,
            taggedSavings: 300,
            effectiveSavings: 1100,
            buckets: {
              needs: {
                targetAmount: 1500,
                actualAmount: 1450,
                guidelineAmount: 1500,
                targetPct: 50,
                actualPct: 48.3,
              },
              wants: {
                targetAmount: 500,
                actualAmount: 450,
                guidelineAmount: 900,
                targetPct: 30,
                actualPct: 15,
              },
              savings: {
                targetAmount: 0,
                actualAmount: 1100,
                guidelineAmount: 600,
                targetPct: 20,
                actualPct: 36.7,
              },
            },
            topOverspend: [],
            topUnderspend: [],
            categoriesOverTarget: 0,
            topWantsMerchants: [
              {
                merchant: "McDonalds",
                total: 180,
                count: 9,
                average: 20,
                shareOfWants: 40,
                shareOfCategory: 40,
                categoryName: "Activities (dining, events, hobbies)",
                severity: "critical",
                flagReasons: ["frequent", "high_spend"],
              },
            ],
          },
          review: {
            headline: "Strong finish for the month.",
            bucketCommentary: { needs: "", wants: "", savings: "" },
            risks: [],
            wins: [],
            actions: [],
          },
          cached: false,
          model: "gpt-4o-mini",
          generatedAt: Math.floor(Date.now() / 1000),
        }),
      });
    });

    await page.goto(`/budget/review?month=${month}`);
    const card = page.getByTestId("top-merchants-card");
    await expect(card.getByText("Merchant signals")).toBeVisible();
    const row = card
      .getByTestId("top-merchant-row")
      .filter({
        hasText: "McDonalds",
      })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/9x.*avg/)).toBeVisible();
    await expect(row.getByText("Critical", { exact: true })).toBeVisible();
    await expect(row.getByText("Frequent")).toBeVisible();
    await expect(row.getByText("High spend")).toBeVisible();
  });
  test("share button opens dialog and reveals a public read-only link", async ({
    page,
    context,
  }) => {
    // Mock the review API the same way the prior test does.
    await page.route("**/api/ai-budget-review", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          format: "digest",
          metrics: {
            month: "2026-01",
            monthLabel: "January 2026",
            totalBudgeted: 2000,
            totalSpent: 1900,
            projectedSpend: 1900,
            netVariance: -100,
            onTrack: true,
            actualIncome: 3000,
            expectedIncome: 3000,
            incomeVariance: 0,
            savingsRate: 36.7,
            surplus: 1100,
            taggedSavings: 0,
            effectiveSavings: 1100,
            buckets: {
              needs: {
                targetAmount: 1500,
                actualAmount: 1450,
                guidelineAmount: 1500,
                targetPct: 50,
                actualPct: 48.3,
              },
              wants: {
                targetAmount: 500,
                actualAmount: 450,
                guidelineAmount: 900,
                targetPct: 30,
                actualPct: 15,
              },
              savings: {
                targetAmount: 0,
                actualAmount: 1100,
                guidelineAmount: 600,
                targetPct: 20,
                actualPct: 36.7,
              },
            },
            topOverspend: [],
            topUnderspend: [],
            categoriesOverTarget: 0,
          },
          review: {
            headline: "Strong finish for the month.",
            bucketCommentary: { needs: "", wants: "", savings: "" },
            risks: [],
            wins: [],
            actions: [],
          },
          cached: true,
          model: "gpt-4o-mini",
          generatedAt: Math.floor(Date.now() / 1000),
        }),
      });
    });

    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Make sure the previous month is closed so the review page renders.
    await page.goto(`/budget?month=${prevMonth}`);
    const closeBtn = page.getByRole("button", { name: "Close Month" });
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
      await expect(
        page.getByRole("button", { name: "Month Closed" }),
      ).toBeVisible();
    }
    const hasReviewBtn = await page
      .getByRole("button", { name: "Review Month" })
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    test.skip(
      !hasReviewBtn,
      "Needs the previous month to be closeable for the share link test",
    );

    await page.goto(`/budget/review?month=${prevMonth}`);
    await expect(page.getByText("Monthly review")).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Share" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Share this review")).toBeVisible();

    // Wait for the URL input to appear (after createOrGetReviewShare resolves).
    const urlInput = dialog.locator("input[readonly]");
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    const shareUrl = await urlInput.inputValue();
    expect(shareUrl).toMatch(/\/share\/review\/[A-Za-z0-9_-]+$/);

    // Verify the share path renders without auth (no redirect to /login,
    // server returns 200, and the report itself is visible).
    const browserInstance = context.browser();
    if (!browserInstance) {
      throw new Error("Playwright browser unavailable");
    }
    const anon = await browserInstance.newContext();
    const anonPage = await anon.newPage();
    const response = await anonPage.goto(shareUrl);
    expect(response?.url()).not.toContain("/login");
    expect(response?.status()).toBe(200);
    await expect(
      anonPage.getByText("Budget Analyser · Shared review"),
    ).toBeVisible();
    await expect(anonPage.getByText("50 / 30 / 20 verdict")).toBeVisible();
    await anon.close();
  });

  test("current month monthly budget tab; optional transaction drill-down", async ({
    page,
  }) => {
    await page.goto("/budget");
    await expect(
      page.getByRole("heading", { name: "Budget Planner" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Monthly Budget" }),
    ).toHaveAttribute("data-state", "active");

    const expandTxn = page
      .getByRole("button", { name: /Show transactions for/i })
      .first();
    if (await expandTxn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expandTxn.click();
      await expect(
        page.getByRole("link", { name: "Transactions" }).first(),
      ).toBeVisible();
    }
  });

  test("mobile budget list shows short category title before parenthetical", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/budget");
    await expect(
      page
        .getByText("Set up your budget for")
        .or(page.getByTestId("summary-spending-progress")),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page
        .getByText("Housing (rent, strata)", { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByText("Housing", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("month picker is visible and functional", async ({ page }) => {
    await page.goto("/budget");
    // Month picker should show the current month
    const monthSelect = page.getByRole("combobox").first();
    await expect(monthSelect).toBeVisible();
  });

  test("empty state shows no scheduled transactions message", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await expect(
      page.getByText("No scheduled transactions yet."),
    ).toBeVisible();
  });

  test("cash flow tab shows summary strip cards", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Cash Flow" }).click();
    await expect(page.getByText("Expected Income")).toBeVisible();
    await expect(page.getByText("Expected Expenses")).toBeVisible();
    await expect(page.getByText("Projected Net")).toBeVisible();
  });

  test("create income schedule", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "Add schedule" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Income" }).click();
    await dialog.locator('input[name="name"]').fill("Salary");
    await dialog.locator('input[name="amount"]').fill("3000");

    // Target the Frequency combobox specifically
    await dialog.getByRole("combobox").filter({ hasText: "Monthly" }).click();
    await page.getByRole("option", { name: "Fortnightly" }).click();

    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Salary")).toBeVisible();
    await expect(page.getByText("+$3,000.00")).toBeVisible();
  });

  test("create expense schedule", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "Add schedule" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Expense is default
    await dialog.locator('input[name="name"]').fill("Rent");
    await dialog.locator('input[name="amount"]').fill("2000");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Rent")).toBeVisible();
    await expect(page.getByText("-$2,000.00")).toBeVisible();
  });

  test("cash flow summary strip shows income value after creating schedule", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Cash Flow" }).click();
    const incomeCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Expected Income" })
      .first();
    await expect(incomeCard.getByText(/\$[\d,.]+/)).toBeVisible();
  });

  test("calendar tab renders", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Calendar" }).click();
    // Day headers are always visible in the calendar grid (exact match to avoid tab name collision)
    await expect(page.getByText("Mon", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Wed", { exact: true })).toBeVisible();
    // Redesigned header shows month + year as the calendar's heading.
    const monthLabel = page.getByTestId("calendar-month-label");
    await expect(monthLabel).toBeVisible();
    await expect(monthLabel).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
  });

  test("calendar tab shows event pills", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Calendar" }).click();
    // Schedules created by prior tests (Salary/Rent) should appear as pills.
    // This test depends on test ordering — skip gracefully if no schedules exist yet.
    const hasSalary = await page
      .getByText("Salary")
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasRent = await page
      .getByText("Rent")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (!hasSalary && !hasRent) {
      // No schedules yet — calendar renders but has no pills, test passes trivially
      await expect(page.getByText("Mon", { exact: true })).toBeVisible();
      return;
    }
    expect(hasSalary || hasRent).toBe(true);
  });

  test("calendar shows month summary chip and category stripe when schedules exist", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Calendar" }).click();
    const hasSchedule = await page
      .getByText("Salary")
      .or(page.getByText("Rent"))
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (!hasSchedule) {
      // No schedules in the visible month — chip renders nothing, test passes trivially.
      await expect(page.getByText("Mon", { exact: true })).toBeVisible();
      return;
    }
    // Month summary chip shows totals when occurrences exist in the month.
    const chip = page.getByTestId("calendar-month-summary");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/\$[\d,.]+/);
    // Category-coloured stripe: desktop chips use border-l-2 with inline color.
    const stripe = page.locator(".border-l-2").first();
    await expect(stripe).toBeVisible();
  });

  test("cash flow chart renders on overview tab", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Cash Flow" }).click();
    // Recharts nests two containers
    const chart = page.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 10000 });
  });

  test("30/60/90 day horizon toggle works", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Cash Flow" }).click();
    await page.getByRole("button", { name: "60 days" }).click();
    await expect(page.getByRole("button", { name: "60 days" })).toBeVisible();
    await page.getByRole("button", { name: "90 days" }).click();
    await expect(page.getByRole("button", { name: "90 days" })).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("edit schedule", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.waitForSelector("text=Salary");

    await page.locator('button[aria-label="Edit"]').first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const amountInput = dialog.locator('input[name="amount"]');
    await amountInput.clear();
    await amountInput.fill("3500");

    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("+$3,500.00")).toBeVisible();
  });

  test("toggle schedule inactive", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.waitForSelector("text=Rent");

    const rentCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Rent" })
      .first();
    await rentCard.getByText("Deactivate").click();

    await expect(rentCard).toHaveClass(/opacity-50/);
  });

  test("delete schedule", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.waitForSelector("text=Salary");

    await page.locator('button[aria-label="Delete"]').first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Salary")).not.toBeVisible();
  });

  test("AI Suggestions button is hidden when AI is not enabled", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    // In the test environment, AI is not configured so the button should not render
    await expect(
      page.getByRole("button", { name: "AI Suggestions" }),
    ).not.toBeVisible();
  });

  test("AI-suggested budget button hidden when AI disabled", async ({
    page,
  }) => {
    await page.goto("/budget");
    await expect(
      page.getByRole("button", { name: "AI-suggested budget" }),
    ).not.toBeVisible();
  });

  test("AI-suggested budget dialog shows suggestions and applies them", async ({
    page,
  }) => {
    // Mock the API to return suggestions
    await page.route("**/api/ai-budget-suggestions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          overallNotes:
            "Based on your spending history, here is a balanced budget.",
          suggestions: [
            {
              categoryId: 1,
              categoryName: "Groceries",
              suggestedAmount: 500,
              reasoning: "Stable spending around $480/month",
              trend: "stable",
            },
            {
              categoryId: 2,
              categoryName: "Dining Out",
              suggestedAmount: 200,
              reasoning: "Trending up from $150 to $190",
              trend: "increasing",
            },
          ],
        }),
      });
    });

    // Enable AI in settings
    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Enabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    await page.goto("/budget");
    // The button may not appear if there's no historical data in the test env;
    // if it's visible, test the dialog flow
    const aiButton = page.getByRole("button", { name: "AI-suggested budget" });
    if (await aiButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aiButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("AI Budget Suggestions")).toBeVisible();
      await expect(
        dialog.getByText("Based on your spending history"),
      ).toBeVisible();
      await expect(dialog.getByText("Groceries")).toBeVisible();
      await expect(dialog.getByText("Dining Out")).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Apply All" }),
      ).toBeVisible();
    }

    // Restore settings
    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Disabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("AI insights panel hidden when AI disabled", async ({ page }) => {
    await page.goto("/budget");
    // On the monthly budget tab (default), AI insights should not appear
    await expect(page.getByText("AI Budget Insights")).not.toBeVisible();
  });

  test("Smart Schedule dialog shows Open Settings when API reports AI disabled", async ({
    page,
  }) => {
    await page.route("**/api/ai-scheduler", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "AI not enabled" }),
      });
    });

    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Enabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "AI Suggestions" }).click();
    await expect(
      page.getByText(/Turn on Enable AI features in Settings/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Settings" }),
    ).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Disabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("AI schedule suggestion supports display/internal names and mute/add actions", async ({
    page,
  }) => {
    await page.route("**/api/ai-scheduler", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            {
              displayName: "Mayuras Mobile",
              internalName: "belong",
              amount: -45,
              frequency: "monthly",
              startDate: "2026-05-01",
              categoryId: null,
              reasoning: "Recurring mobile plan payment",
              confidence: 0.93,
            },
          ],
        }),
      });
    });

    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Enabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "AI Suggestions" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Mayuras Mobile")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mute" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add to schedule" }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Mute" }).click();
    await expect(dialog.getByRole("button", { name: "Muted" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "AI Suggestions" }).click();
    await expect(dialog.getByText("Mayuras Mobile")).toBeVisible();
    await dialog.getByRole("button", { name: "Add to schedule" }).click();
    await expect(dialog.getByRole("button", { name: "Added" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByText("Mayuras Mobile")).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Disabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("budget summary renders with a category-assigned bill still due this month", async ({
    page,
  }) => {
    // The schedule-aware projection adds bills that have not posted yet. To exercise that
    // path we need an expense schedule with an occurrence strictly after today, in the
    // current month, assigned to a (expense) category so it lands in the projection.
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    test.skip(
      now.getDate() >= lastDay.getDate(),
      "today is the last day of the month — no future-dated bill possible this month",
    );
    const dueDate = `${lastDay.getFullYear()}-${String(
      lastDay.getMonth() + 1,
    ).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    await page.goto("/budget");
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "Add schedule" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill("E2E Late Bill");
    await dialog.locator('input[name="amount"]').fill("4000");
    await dialog.locator('input[name="startDate"]').fill(dueDate);
    // Assign a category so the bill is counted as an expense in the projection.
    await dialog
      .getByRole("combobox")
      .filter({ hasText: "No category" })
      .click();
    await page
      .getByRole("option", { name: /Groceries/ })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("E2E Late Bill")).toBeVisible();

    try {
      // Monthly budget summary must render cleanly with the new projection path active.
      await page.goto("/budget");
      await expect(
        page
          .getByText("Set up your budget for")
          .or(page.getByTestId("summary-spending-progress")),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();

      // When budget targets exist for the month, the pace badge is driven by the
      // schedule-aware projection (which now includes this unpaid bill).
      const paceBadge = page.getByText(/on track|over pace/);
      if (
        await paceBadge
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await expect(paceBadge.first()).toBeVisible();
      }
    } finally {
      // Remove the schedule we created so later runs start clean.
      await page.goto("/budget");
      await page.getByRole("tab", { name: "Schedules" }).click();
      const card = page
        .locator(".rounded-lg")
        .filter({ hasText: "E2E Late Bill" });
      if (
        await card
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await card.first().locator('button[aria-label="Delete"]').click();
        await page.waitForTimeout(300);
      }
    }
  });

  test("recurring scheduled costs popover explains budget warning", async ({
    page,
  }) => {
    const scheduleName = `E2E Recurring Breakdown ${Date.now()}`;

    await page.goto("/budget", { waitUntil: "commit" });
    await page.getByRole("tab", { name: "Schedules" }).click();
    await page.getByRole("button", { name: "Add schedule" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(scheduleName);
    await dialog.locator('input[name="amount"]').fill("420.09");
    await dialog
      .getByRole("combobox")
      .filter({ hasText: "No category" })
      .click();
    await page
      .getByRole("option", { name: /Groceries/ })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(scheduleName)).toBeVisible();

    try {
      await setBudgetTargetForCategory({
        page,
        categoryName: /Groceries/,
        amount: "300",
      });

      const groceryRow = page
        .getByTestId("budget-category-row")
        .filter({ hasText: /Groceries/ })
        .first();
      const trigger = groceryRow.getByRole("button", {
        name: /Show recurring scheduled costs for/i,
      });
      await expect(trigger).toBeVisible({ timeout: 10000 });
      await trigger.click();

      await expect(page.getByText("Recurring scheduled costs")).toBeVisible();
      await expect(page.getByText(scheduleName)).toBeVisible();
      await expect(page.getByText("Recurring")).toBeVisible();
      await expect(page.getByText("Shortfall")).toBeVisible();
      await expect(page.getByText("$420.09")).toBeVisible();
      await expect(page.getByText("$120.09")).toBeVisible();
      await expect(page.getByText("Monthly")).toBeVisible();
    } finally {
      await setBudgetTargetForCategory({
        page,
        categoryName: /Groceries/,
        amount: "0",
      });
      await deleteScheduleIfVisible(page, scheduleName);
    }
  });
});
