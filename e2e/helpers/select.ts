import type { Locator, Page } from "@playwright/test";

export async function selectOption(
  page: Page,
  triggerLocator: Locator,
  optionName: string,
) {
  await triggerLocator.click();
  await page.getByRole("option", { name: optionName }).click();
}
