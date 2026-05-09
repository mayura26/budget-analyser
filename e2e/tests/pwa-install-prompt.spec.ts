import { devices, expect, test } from "@playwright/test";

test.describe("PWA install prompt", () => {
  test("does not show on desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Install app" })).toHaveCount(
      0,
    );
  });

  test("shows on mobile (iOS UA) after client timer", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      storageState: "e2e/.auth/user.json",
    });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Install app" })).toBeVisible(
      { timeout: 5000 },
    );
    await context.close();
  });
});
