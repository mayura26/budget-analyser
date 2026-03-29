import { expect, test } from "@playwright/test";

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
    await expect(page.getByText(/\w+ \d{4}/)).toBeVisible();
  });

  test("month picker controls visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("combobox")).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Previous month")).toBeVisible();
    await expect(page.getByLabel("Next month")).toBeVisible();
  });

  test("four summary cards present", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of ["Income", "Expenses", "Net", "Transactions"]) {
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

  test("pie chart net slider toggles copy", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText("Spending by Category", { exact: true }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: /net in pie/i });
    await expect(slider).toBeVisible();
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box?.x + box?.width - 2, box?.y + box?.height / 2);
    await expect(
      page.getByText("Net by Category", { exact: true }),
    ).toBeVisible({
      timeout: 10000,
    });
    await page.mouse.click(box?.x + 2, box?.y + box?.height / 2);
    await expect(
      page.getByText("Spending by Category", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
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
