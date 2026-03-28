import { expect, test } from "@playwright/test";

test.describe("Settings", () => {
  test("AI card renders", async ({ page }) => {
    await page.goto("/settings");
    // CardTitle renders as a div — use exact match to avoid matching "Enable AI features" label
    await expect(page.getByText("AI features", { exact: true })).toBeVisible();
  });

  test("AI card mentions Smart Schedule and OPENAI_API_KEY", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(
      page.getByText(/Smart Schedule Suggestions/i),
    ).toBeVisible();
    await expect(page.getByText(/OPENAI_API_KEY/i)).toBeVisible();
  });

  test("model select shows default", async ({ page }) => {
    await page.goto("/settings");
    // Match the visible combobox trigger, not the hidden option element
    await expect(
      page.getByRole("combobox").filter({ hasText: /gpt-4o mini/i }),
    ).toBeVisible();
  });

  test("model select includes a reasoning model option", async ({ page }) => {
    await page.goto("/settings");
    await page
      .getByRole("combobox")
      .filter({ hasText: /gpt-4o mini/i })
      .click();
    await expect(
      page.getByRole("option", { name: /o3-mini \(reasoning\)/i }),
    ).toBeVisible();
  });

  test("AI enabled select lists Disabled and Enabled", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Enable AI features").click();
    await expect(page.getByRole("option", { name: "Disabled" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Enabled" })).toBeVisible();
  });

  test("save shows success message", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("bank profiles section renders built-in profiles", async ({ page }) => {
    await page.goto("/settings");
    for (const name of ["CommBank", "Monzo", "Coles"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("built-in").first()).toBeVisible();
  });
});
