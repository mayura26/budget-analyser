import { expect, test } from "@playwright/test";

test.describe("Auth", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid password")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("correct password redirects", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("changeme");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/dashboard");
  });

  test("unauthenticated /dashboard redirects to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
    await context.close();
  });

  test("unauthenticated /accounts redirects to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/accounts");
    await expect(page).toHaveURL("/login");
    await context.close();
  });

  test("logout clears session", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("/login");
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });
});
