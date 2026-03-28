import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("changeme");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
