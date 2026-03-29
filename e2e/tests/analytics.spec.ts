import { expect, test } from "@playwright/test";

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
    await expect(page.getByText(/Spending by category/i)).toBeVisible();
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
