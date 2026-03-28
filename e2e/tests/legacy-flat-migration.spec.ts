import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.describe("Legacy flat category migration", () => {
  test("user main groups are not reparented; legacy flat names still migrate", () => {
    const out = execSync("npm run test:legacy-migrate", {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env },
    });
    expect(out).toContain("legacy flat migration verification OK");
  });
});
