import { expect, type Page, test } from "@playwright/test";

async function createAnalyticsTestAccount(page: Page) {
  const accountName = `Analytics Merchants ${Date.now()}`;
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
      await expect(card.getByText("Top spend merchants")).toBeVisible();
      await expect(card.getByText("McDonalds")).toBeVisible();
      await expect(card.getByText(/7x.*avg/)).toBeVisible();
      await expect(card.getByText("Frequent")).toBeVisible();
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

    try {
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
          amount: -295,
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
      await expect(card.getByText("E2E One Off Feast")).toBeVisible();
      await expect(card.getByText("Category share").first()).toBeVisible();
      await expect(card.getByText("E2E One Off Socks")).not.toBeVisible();
    } finally {
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
