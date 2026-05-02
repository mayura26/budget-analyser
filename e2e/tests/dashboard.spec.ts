import { expect, test } from "@playwright/test";

const DASHBOARD_PIE_ACCOUNT = "Dashboard Pie Test Account";

test.describe("Dashboard", () => {
  test("page title renders", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("month subtitle visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByText(/summary and category breakdown for/i),
    ).toBeVisible();
    await expect(page.getByText(/\w+ \d{4}/).first()).toBeVisible();
  });

  test("month picker controls visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("combobox")).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Previous month")).toBeVisible();
    await expect(page.getByLabel("Next month")).toBeVisible();
  });

  test("five summary cards present", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of [
      "Income",
      "Expenses",
      "Savings",
      "Net",
      "Transactions",
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("currency-formatted values in income card", async ({ page }) => {
    await page.goto("/dashboard");
    // Income card shows a formatted currency value (even if $0.00)
    const incomeCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Income" })
      .first();
    await expect(incomeCard.getByText(/\$[\d,.]+/)).toBeVisible();
  });

  test("charts section renders", async ({ page }) => {
    await page.goto("/dashboard");
    // DashboardCharts is a client component — wait for hydration
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("spending chart help popover on narrow viewports", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await page
      .getByRole("button", { name: /full chart explanation/i })
      .click();
    await expect(
      page.getByRole("dialog").getByText(
        /Outflows only — same as expense totals elsewhere\. Turn on Include Net/i,
      ),
    ).toBeVisible();
  });

  test("include net slider disabled when monthly net is zero", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup?transactions=1");
    await page.goto("/dashboard");
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText("Spending by Category", { exact: true }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: /include net/i });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("data-disabled", "");
  });

  test.describe("pie chart with positive net", () => {
    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "e2e/.auth/user.json",
      });
      const page = await context.newPage();

      await page.goto("/accounts");

      while (true) {
        const card = page
          .locator(".rounded-lg.border")
          .filter({ hasText: DASHBOARD_PIE_ACCOUNT })
          .first();
        if (!(await card.isVisible({ timeout: 2000 }).catch(() => false)))
          break;
        await card.locator("button:has(.lucide-trash-2)").click();
        await page.getByRole("button", { name: "Delete" }).click();
        await page.waitForSelector('[role="dialog"]', { state: "hidden" });
        await page.waitForTimeout(300);
      }

      await page.getByRole("button", { name: "Add account" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator('input[name="name"]').fill(DASHBOARD_PIE_ACCOUNT);
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "CommBank" }).click();
      await dialog.getByRole("button", { name: "Create account" }).click();
      await page.waitForSelector(`text=${DASHBOARD_PIE_ACCOUNT}`);

      await context.close();
    });

    test("include net adds Unspent slice and Income allocation title", async ({
      page,
    }) => {
      const now = new Date();
      const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName: DASHBOARD_PIE_ACCOUNT,
          count: 2,
          reset: true,
          seedMonth,
          addIncome: true,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.goto(`/dashboard?month=${seedMonth}`);
      await expect(page.getByText(/monthly overview/i)).toBeVisible({
        timeout: 10000,
      });

      const slider = page.getByRole("slider", { name: /include net/i });
      await expect(slider).not.toHaveAttribute("data-disabled");
      await slider.focus();
      await page.keyboard.press("End");
      await expect(
        page.getByText("Income allocation", { exact: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText("Unspent", { exact: true }),
      ).toBeVisible();
    });
  });

  test("sidebar brand links to dashboard from another page", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page
      .locator("aside")
      .getByRole("link", { name: "Budget Analyser" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("mobile header brand links to dashboard from another page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/budget");
    await page
      .locator("header")
      .getByRole("link", { name: "Budget Analyser" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
