import { expect, test } from "@playwright/test";

test.describe("Rule builder chat", () => {
  test("dialog opens with transaction context and chat input", async ({
    page,
  }) => {
    await page.goto("/categories");

    await page.getByTestId("rule-builder-chat-trigger").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Build rules with AI/i }),
    ).toBeVisible();
    await expect(page.getByTestId("rule-builder-sample-search")).toBeVisible();
    await expect(page.getByTestId("rule-builder-chat-input")).toBeVisible();
  });

  test("mocked assistant returns proposed rules and preview works", async ({
    page,
  }) => {
    await page.route("**/api/chat-rule-builder", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Here are two keyword rules.",
          proposedRules: [
            {
              categoryId: 1,
              pattern: "MESSINA",
              patternType: "keyword",
            },
            {
              categoryId: 2,
              pattern: "DOMINOS",
              patternType: "keyword",
            },
          ],
        }),
      });
    });

    await page.goto("/categories");
    await page.getByTestId("rule-builder-chat-trigger").click();

    await page
      .getByTestId("rule-builder-chat-input")
      .fill("Map ice cream and takeout");
    await page.getByTestId("rule-builder-chat-send").click();

    await expect(page.getByText("Proposed rules")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("MESSINA")).toBeVisible();
    await expect(page.getByText("DOMINOS")).toBeVisible();

    await page.getByRole("button", { name: "Preview matches" }).click();
    await expect(page.getByText(/unverified match/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
