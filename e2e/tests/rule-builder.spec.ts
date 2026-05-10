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

    await expect(page.getByText("Proposed rules")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("MESSINA")).toBeVisible();
    await expect(page.getByText("DOMINOS")).toBeVisible();

    await page.getByRole("button", { name: "Preview matches" }).click();
    await expect(page.getByText(/unverified match/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("rules accumulate across multiple AI turns", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/chat-rule-builder", async (route) => {
      callCount++;
      const rules =
        callCount === 1
          ? [{ categoryId: 1, pattern: "MESSINA", patternType: "keyword" }]
          : [{ categoryId: 2, pattern: "DOMINOS", patternType: "keyword" }];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: `Turn ${callCount}`, proposedRules: rules }),
      });
    });

    await page.goto("/categories");
    await page.getByTestId("rule-builder-chat-trigger").click();

    await page.getByTestId("rule-builder-chat-input").fill("First turn");
    await page.getByTestId("rule-builder-chat-send").click();
    await expect(page.getByText("MESSINA")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("rule-builder-chat-input").fill("Second turn");
    await page.getByTestId("rule-builder-chat-send").click();
    await expect(page.getByText("DOMINOS")).toBeVisible({ timeout: 10_000 });

    // Both rules from both turns should be visible
    await expect(page.getByText("MESSINA")).toBeVisible();
    await expect(page.getByText("DOMINOS")).toBeVisible();
  });

  test("can edit a proposed rule inline before saving", async ({ page }) => {
    await page.route("**/api/chat-rule-builder", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Here is one rule.",
          proposedRules: [{ categoryId: 1, pattern: "ORIGINAL", patternType: "keyword" }],
        }),
      });
    });

    await page.goto("/categories");
    await page.getByTestId("rule-builder-chat-trigger").click();
    await page.getByTestId("rule-builder-chat-input").fill("test");
    await page.getByTestId("rule-builder-chat-send").click();
    await expect(page.getByText("ORIGINAL")).toBeVisible({ timeout: 10_000 });

    // Click the edit (pencil) button on the proposed rule
    await page.locator('[aria-label="Edit rule"]').click();
    const patternInput = page.locator('[aria-label="Pattern"]');
    await expect(patternInput).toBeVisible();
    await patternInput.fill("EDITED_PATTERN");
    await page.getByRole("button", { name: /save/i }).first().click();

    await expect(page.getByText("EDITED_PATTERN")).toBeVisible();
    await expect(page.getByText("ORIGINAL")).not.toBeVisible();
  });

  test("clear all removes all proposed rules", async ({ page }) => {
    await page.route("**/api/chat-rule-builder", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Rules.",
          proposedRules: [{ categoryId: 1, pattern: "TOCLEAN", patternType: "keyword" }],
        }),
      });
    });

    await page.goto("/categories");
    await page.getByTestId("rule-builder-chat-trigger").click();
    await page.getByTestId("rule-builder-chat-input").fill("test");
    await page.getByTestId("rule-builder-chat-send").click();
    await expect(page.getByText("TOCLEAN")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /clear all/i }).click();
    await expect(page.getByText("TOCLEAN")).not.toBeVisible();
    await expect(page.getByText("Proposed rules")).not.toBeVisible();
  });
});
