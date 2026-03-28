import { type Browser, expect, test } from "@playwright/test";

async function cleanupSchedules(browser: Browser) {
  const context = await browser.newContext({
    storageState: "e2e/.auth/user.json",
  });
  const page = await context.newPage();
  await page.goto("/budget");
  await page.getByRole("tab", { name: "Schedules" }).click();
  await page.waitForTimeout(500);
  // Delete all existing scheduled transactions
  let count = await page.locator('button[aria-label="Delete"]').count();
  while (count > 0) {
    await page.locator('button[aria-label="Delete"]').first().click();
    await page.waitForTimeout(300);
    count = await page.locator('button[aria-label="Delete"]').count();
  }
  await context.close();
}

test.describe("Budget", () => {
  test.beforeAll(async ({ browser }) => {
    await cleanupSchedules(browser);
  });

  test("page renders with heading", async ({ page }) => {
    await page.goto("/budget");
    await expect(
      page.getByRole("heading", { name: "Budget Planner" }),
    ).toBeVisible();
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

  test("summary strip cards visible", async ({ page }) => {
    await page.goto("/budget");
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

  test("summary strip shows income value after creating schedule", async ({
    page,
  }) => {
    await page.goto("/budget");
    const incomeCard = page
      .locator(".rounded-lg")
      .filter({ hasText: "Expected Income" })
      .first();
    await expect(incomeCard.getByText(/\$[\d,.]+/)).toBeVisible();
  });

  test("calendar tab renders", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect(page.getByText(/\w+ \d{4}/)).toBeVisible();
    await expect(page.getByText("Mon")).toBeVisible();
  });

  test("calendar tab shows event pills", async ({ page }) => {
    await page.goto("/budget");
    await page.getByRole("tab", { name: "Calendar" }).click();
    // Navigate months until we find a pill (schedules exist from prior tests)
    for (let i = 0; i < 3; i++) {
      const count = await page.locator(".bg-green-100, .bg-red-100").count();
      if (count > 0) break;
      await page
        .getByRole("button")
        .filter({ has: page.locator(".lucide-chevron-right") })
        .click();
    }
    await expect(
      page.locator(".bg-green-100, .bg-red-100").first(),
    ).toBeVisible();
  });

  test("cash flow chart renders on overview tab", async ({ page }) => {
    await page.goto("/budget");
    // Overview is default tab — use .first() since recharts nests two containers
    const chart = page.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 10000 });
  });

  test("30/60/90 day horizon toggle works", async ({ page }) => {
    await page.goto("/budget");
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
    await expect(page.getByRole("link", { name: "Open Settings" })).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await page.getByRole("option", { name: "Disabled" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });
});
