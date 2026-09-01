import { expect, type Page, test } from "@playwright/test";

const DASHBOARD_PIE_ACCOUNT = "Dashboard Pie Test Account";

async function createDashboardTestAccount(page: Page) {
  const accountName = `Dashboard Summary ${Date.now()}`;
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(accountName);
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "CommBank" }).click();
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(accountName)).toBeVisible();

  return accountName;
}

async function deleteDashboardTestAccount(page: Page, accountName: string) {
  await page.goto("/accounts");
  const card = page.locator(".rounded-lg").filter({ hasText: accountName });
  if (
    !(await card
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false))
  ) {
    return;
  }
  await card.first().locator("button:has(.lucide-trash-2)").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "hidden" });
}

async function addManualDashboardTransaction({
  page,
  accountName,
  date,
  description,
  amount,
  categoryText,
}: {
  page: Page;
  accountName: string;
  date: string;
  description: string;
  amount: string;
  categoryText: string | RegExp;
}) {
  await page.goto("/transactions/new");
  await page.locator('select[name="accountId"]').selectOption({
    label: accountName,
  });
  await page.locator('input[name="date"]').fill(date);
  await page.locator('input[name="description"]').fill(description);
  await page.locator('input[name="amount"]').fill(amount);

  const categoryOption = page
    .locator('select[name="categoryId"] option')
    .filter({ hasText: categoryText })
    .first();
  const categoryId = await categoryOption.getAttribute("value");
  if (!categoryId) throw new Error(`Category not found: ${categoryText}`);
  await page.locator('select[name="categoryId"]').selectOption(categoryId);

  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL("/transactions");
}

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
    await expect(page.getByText(/\w+ \d{4}/).first()).toBeVisible();
  });

  test("month picker controls visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("combobox")).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Previous month")).toBeVisible();
    await expect(page.getByLabel("Next month")).toBeVisible();
  });

  test("money flow and trend charts render", async ({ page }) => {
    await page.goto("/dashboard");
    // Money-flow graphic replaces the old summary tiles.
    await expect(page.getByTestId("money-flow")).toBeVisible();
    // Stacked expenses-vs-income trend chart.
    await expect(
      page.getByText("Expenses vs Income", { exact: true }),
    ).toBeVisible();
  });

  test("charts section renders", async ({ page }) => {
    await page.goto("/dashboard");
    // DashboardCharts is a client component — wait for hydration
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("flags repeated wants merchants", async ({ page }) => {
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);

    try {
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 6,
          reset: true,
          seedMonth,
          categoryName: "Activities (dining, events, hobbies)",
          merchant: "McDonalds",
          description: "E2E McDonalds dashboard",
          amount: -400,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.goto(`/dashboard?month=${seedMonth}`);
      const card = page.getByTestId("top-merchants-card");
      await expect(card.getByText("Merchant signals")).toBeVisible();
      const row = card
        .getByTestId("top-merchant-row")
        .filter({
          hasText: "McDonalds",
        })
        .first();
      await expect(row).toBeVisible();
      await expect(row.getByText(/6x.*avg/)).toBeVisible();
      await expect(row.getByText("Critical", { exact: true })).toBeVisible();
      await expect(row.getByText("Frequent")).toBeVisible();
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("merchant signals can expand beyond the first two rows", async ({
    page,
  }) => {
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);
    const suffix = Date.now().toString(36);
    const merchants = [
      {
        name: `E2E Signal Alpha ${suffix}`,
        displayName: `E2E Signal Alpha ${suffix}`,
        amount: -5000,
      },
      {
        name: `E2E Signal Beta ${suffix}`,
        displayName: `E2E Signal Beta ${suffix}`,
        amount: -4800,
      },
      {
        name: `E2E Signal Gamma ${suffix}`,
        displayName: `E2E Signal Gamma ${suffix}`,
        amount: -4600,
      },
    ];

    try {
      for (const [index, merchant] of merchants.entries()) {
        const seed = await page.request.post("/api/test-seed-transactions", {
          data: {
            accountName,
            count: 5,
            reset: index === 0,
            seedMonth,
            categoryName: "Activities (dining, events, hobbies)",
            merchant: merchant.name,
            description: merchant.name,
            amount: merchant.amount,
          },
        });
        expect(seed.ok()).toBeTruthy();
      }

      await page.goto(`/dashboard?month=${seedMonth}`);
      const card = page.getByTestId("top-merchants-card");
      await expect(card.getByText("Merchant signals")).toBeVisible();
      await expect(card.getByTestId("top-merchant-row")).toHaveCount(2);
      await expect(card.getByText(merchants[0].displayName)).toBeVisible();
      await expect(card.getByText(merchants[1].displayName)).toBeVisible();
      await expect(card.getByText(merchants[2].displayName)).toHaveCount(0);

      await card.getByRole("button", { name: /Show \d+ more/ }).click();

      await expect(card.getByTestId("top-merchant-row").nth(2)).toBeVisible();
      await expect(card.getByText(merchants[2].displayName)).toBeVisible();

      await card.getByRole("button", { name: "Show less" }).click();
      await expect(card.getByTestId("top-merchant-row")).toHaveCount(2);
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("monthly overview scale labels stay inside the chart", async ({
    page,
  }) => {
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);

    try {
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 1,
          reset: true,
          seedMonth,
          addIncome: true,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.goto(`/dashboard?month=${seedMonth}`);
      const chartCard = page
        .locator(".rounded-lg")
        .filter({ hasText: "Monthly Overview" })
        .first();
      await expect(chartCard.getByText(/monthly overview/i)).toBeVisible({
        timeout: 10000,
      });
      const tickLabels = chartCard.locator("svg text").filter({
        hasText: "AUD",
      });
      await expect(tickLabels.first()).toContainText("AUD");
      await expect(chartCard.getByText("Income avg")).toBeVisible();
      await expect(chartCard.getByText("Expenses avg")).toBeVisible();
      const averageLineCount = await chartCard
        .locator('line[stroke-dasharray="2 4"]')
        .count();
      expect(averageLineCount).toBeGreaterThanOrEqual(2);

      const ticks = await tickLabels.evaluateAll((nodes) =>
        nodes.map((node) => {
          const tickRect = node.getBoundingClientRect();
          const svgRect = node.closest("svg")?.getBoundingClientRect();
          return {
            text: node.textContent ?? "",
            clipped: !svgRect || tickRect.left < svgRect.left,
          };
        }),
      );

      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.filter((tick) => tick.clipped)).toEqual([]);
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("50/30/20 compact widget renders alongside Budget Status when targets exist", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const hasBudgetStatus = await page
      .getByText("Budget Status", { exact: true })
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(
      !hasBudgetStatus,
      "Needs budget targets in the current month for the compact widget",
    );

    await expect(page.getByText("50 / 30 / 20 guideline")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-needs")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-wants")).toBeVisible();
    await expect(page.getByTestId("rule-band-chart-savings")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open budget" })).toBeVisible();
  });

  test("spending chart help popover on narrow viewports", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /full chart explanation/i }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(
          /Outflows only — same as expense totals elsewhere\. Turn on Include Net/i,
        ),
    ).toBeVisible();
  });

  test("include net slider disabled when monthly net is zero", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup?transactions=1");
    await page.goto("/dashboard");
    await expect(page.getByText(/monthly overview/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText("Spending by Category", { exact: true }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: /include net/i });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("data-disabled", "");
  });

  test("money flow splits income into tracked savings and net", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup?transactions=1");
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);

    try {
      await addManualDashboardTransaction({
        page,
        accountName,
        date: `${seedMonth}-01`,
        description: "E2E salary",
        amount: "1000",
        categoryText: /^Income/,
      });
      await addManualDashboardTransaction({
        page,
        accountName,
        date: `${seedMonth}-02`,
        description: "E2E savings transfer",
        amount: "-300",
        categoryText: "Long-term savings",
      });

      await page.goto(`/dashboard?month=${seedMonth}`);
      const flow = page.getByTestId("money-flow");
      await expect(flow).toBeVisible();
      // Income $1,000 → Savings $300 (30%) + Net $700 (70%).
      await expect(flow.getByText("$1,000.00")).toBeVisible();
      const desktopLayout = await flow.evaluate((node) => {
        const income = node
          .querySelector('[data-testid="flow-source-income"]')
          ?.getBoundingClientRect();
        const savings = node
          .querySelector('[data-testid="flow-node-savings"] .node-bar')
          ?.getBoundingClientRect();
        return {
          incomeRight: income?.right ?? 0,
          savingsLeft: savings?.left ?? 0,
        };
      });
      expect(desktopLayout.incomeRight).toBeLessThanOrEqual(
        desktopLayout.savingsLeft,
      );
      const chartSizing = await flow.evaluate((node) => {
        const scroller = node.querySelector(".overflow-x-auto");
        const svg = node.querySelector('svg[role="img"]');
        return {
          scrollerWidth: scroller?.getBoundingClientRect().width ?? 0,
          svgWidth: svg?.getBoundingClientRect().width ?? 0,
        };
      });
      expect(chartSizing.svgWidth).toBeGreaterThanOrEqual(
        chartSizing.scrollerWidth - 2,
      );
      await expect(flow.getByTestId("flow-node-income")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await flow.getByTestId("flow-node-income").click();
      await expect(flow.getByTestId("flow-detail-panel-income")).toHaveCount(1);
      await expect(
        flow
          .locator('[data-testid^="flow-detail-income-"]')
          .filter({ hasText: "$1,000.00" })
          .first(),
      ).toBeVisible();
      const incomeExpansion = await flow.evaluate((node) => {
        const source = node
          .querySelector('[data-testid^="flow-detail-income-"] rect')
          ?.getBoundingClientRect();
        const income = node
          .querySelector('[data-testid="flow-source-income"]')
          ?.getBoundingClientRect();
        return {
          sourceRight: source?.right ?? 0,
          incomeLeft: income?.left ?? 0,
        };
      });
      expect(incomeExpansion.sourceRight).toBeLessThanOrEqual(
        incomeExpansion.incomeLeft,
      );

      const savings = page.getByTestId("flow-node-savings");
      await expect(savings.getByText("$300.00")).toBeVisible();
      await expect(savings.getByText(/Savings\b/)).toBeVisible();
      const net = page.getByTestId("flow-node-net");
      await expect(net.getByText("$700.00")).toBeVisible();
      await expect(net.getByText(/Net\b/)).toBeVisible();
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("money flow keeps income as the left input on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.request.delete("/api/test-cleanup?transactions=1");
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);

    try {
      await addManualDashboardTransaction({
        page,
        accountName,
        date: `${seedMonth}-01`,
        description: "E2E mobile salary",
        amount: "1000",
        categoryText: /^Income/,
      });
      await addManualDashboardTransaction({
        page,
        accountName,
        date: `${seedMonth}-02`,
        description: "E2E mobile spending",
        amount: "-250",
        categoryText: "Activities",
      });

      await page.goto(`/dashboard?month=${seedMonth}`);
      const flow = page.getByTestId("money-flow");
      await expect(flow).toBeVisible();
      const mobileLayout = await flow.evaluate((node) => {
        const income = node
          .querySelector('[data-testid="flow-source-income"]')
          ?.getBoundingClientRect();
        const wants = node
          .querySelector('[data-testid="flow-node-wants"] .node-bar')
          ?.getBoundingClientRect();
        const scroller = node.querySelector(".overflow-x-auto");
        return {
          incomeRight: income?.right ?? 0,
          wantsLeft: wants?.left ?? 0,
          clientWidth: scroller?.clientWidth ?? 0,
          scrollWidth: scroller?.scrollWidth ?? 0,
        };
      });
      expect(mobileLayout.incomeRight).toBeLessThanOrEqual(
        mobileLayout.wantsLeft,
      );
      expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(
        mobileLayout.clientWidth + 1,
      );
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("money flow nets refunds so the income source reaches the outflow stack", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup?transactions=1");
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);
    const seedRows = [
      {
        categoryName: "Activities (dining, events, hobbies)",
        amount: -9000,
        addIncome: true,
      },
      { categoryName: "Activities (dining, events, hobbies)", amount: 4000 },
      {
        categoryName: "Long-term savings (house, emergency fund)",
        amount: -5500,
      },
    ];

    try {
      for (const [index, row] of seedRows.entries()) {
        const seed = await page.request.post("/api/test-seed-transactions", {
          data: {
            accountName,
            count: 1,
            reset: index === 0,
            seedMonth,
            addIncome: row.addIncome === true,
            categoryName: row.categoryName,
            amount: row.amount,
          },
        });
        expect(seed.ok()).toBeTruthy();
      }

      await page.goto(`/dashboard?month=${seedMonth}`);
      const flow = page.getByTestId("money-flow");
      await expect(flow).toBeVisible();
      await expect(flow.getByText("Over $500.00")).toBeVisible();
      await expect(flow.getByTestId("flow-node-wants")).toContainText(
        "$5,000.00",
      );
      await expect(flow.getByTestId("flow-node-savings")).toContainText(
        "$5,500.00",
      );

      const sourceGap = await flow.evaluate((node) => {
        const source = node.querySelector(
          '[data-testid="flow-source-shortfall"]',
        );
        const nodeBars = Array.from(node.querySelectorAll(".node-bar"));
        const sourceBottom = source?.getBoundingClientRect().bottom ?? 0;
        const outflowBottom = Math.max(
          ...nodeBars.map((bar) => bar.getBoundingClientRect().bottom),
        );
        return outflowBottom - sourceBottom;
      });
      expect(sourceGap).toBeLessThanOrEqual(2);
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("money flow buckets expand into category detail", async ({ page }) => {
    test.setTimeout(60_000);
    await page.request.delete("/api/test-cleanup?transactions=1");
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);
    const wantsCategories = [
      { name: "Shopping (clothes, random purchases)", amount: -970 },
      { name: "Activities (dining, events, hobbies)", amount: -595 },
      { name: "Subscriptions (Netflix, apps, SaaS)", amount: -420 },
      { name: "Holidays", amount: -385 },
      { name: "Travel (flights, transport)", amount: -300 },
      { name: "Accommodation", amount: -200 },
    ];

    try {
      for (const [index, category] of wantsCategories.entries()) {
        const seed = await page.request.post("/api/test-seed-transactions", {
          data: {
            accountName,
            count: 1,
            reset: index === 0,
            seedMonth,
            addIncome: index === 0,
            categoryName: category.name,
            amount: category.amount,
          },
        });
        expect(seed.ok()).toBeTruthy();
      }

      await page.goto(`/dashboard?month=${seedMonth}`);
      const flow = page.getByTestId("money-flow");
      await expect(flow).toBeVisible();
      await expect(flow.getByTestId("flow-node-wants")).toBeVisible();
      const compactHeight = await flow
        .locator('svg[role="img"]')
        .evaluate((node) => node.getBoundingClientRect().height);

      await flow.getByTestId("flow-node-wants").click();
      await expect(flow.getByTestId("flow-detail-panel-wants")).toHaveCount(1);
      const expandedHeight = await flow
        .locator('svg[role="img"]')
        .evaluate((node) => node.getBoundingClientRect().height);
      expect(expandedHeight).toBeGreaterThan(compactHeight + 150);
      await expect(
        flow
          .locator("svg text")
          .filter({ hasText: /Shopping/ })
          .first(),
      ).toBeVisible();
      await expect(
        flow.locator("svg text").filter({ hasText: "$970.00" }),
      ).toBeVisible();
      const labelBounds = await flow
        .locator('[data-testid^="flow-detail-wants-"] text')
        .evaluateAll((nodes) => {
          const svgRect = nodes[0]?.closest("svg")?.getBoundingClientRect();
          return nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              clipped:
                !svgRect ||
                rect.top < svgRect.top ||
                rect.bottom > svgRect.bottom ||
                rect.left < svgRect.left ||
                rect.right > svgRect.right,
            };
          });
        });
      expect(labelBounds.filter((label) => label.clipped)).toEqual([]);

      await flow
        .getByRole("button", { name: "Collapse Wants breakdown" })
        .press("Enter");
      await expect(flow.getByTestId("flow-detail-panel-wants")).toHaveCount(0);
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });

  test("money flow svg renders before container width is measured", async ({
    page,
  }) => {
    await page.request.delete("/api/test-cleanup?transactions=1");
    const now = new Date();
    const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountName = await createDashboardTestAccount(page);

    try {
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName,
          count: 1,
          reset: true,
          seedMonth,
          addIncome: true,
          categoryName: "Activities (dining, events, hobbies)",
          amount: -250,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.addInitScript(() => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(
          HTMLElement.prototype,
          "clientWidth",
        );
        const isMoneyFlowElement = (target: Element) =>
          Boolean(target.closest('[data-testid="money-flow"]'));

        Object.defineProperty(HTMLElement.prototype, "clientWidth", {
          configurable: true,
          get() {
            if (isMoneyFlowElement(this)) return 0;
            return originalClientWidth?.get?.call(this) ?? 800;
          },
        });

        class TestResizeObserver {
          callback: ResizeObserverCallback;

          constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
          }

          observe(target: Element) {
            const width = isMoneyFlowElement(target) ? 0 : 800;
            this.callback(
              [
                {
                  target,
                  contentRect: {
                    width,
                    height: 400,
                    x: 0,
                    y: 0,
                    top: 0,
                    right: width,
                    bottom: 400,
                    left: 0,
                    toJSON: () => ({}),
                  },
                } as ResizeObserverEntry,
              ],
              this as ResizeObserver,
            );
          }

          unobserve() {}
          disconnect() {}
        }

        Object.defineProperty(window, "ResizeObserver", {
          configurable: true,
          value: TestResizeObserver,
        });
      });

      await page.goto(`/dashboard?month=${seedMonth}`);
      const flow = page.getByTestId("money-flow");
      const graphic = flow.locator('svg[role="img"]');
      await expect(graphic).toBeVisible();
      await expect(graphic).toHaveAttribute("width", "420");
      await expect(flow.locator(".flow-ribbon")).toHaveCount(2);
    } finally {
      await deleteDashboardTestAccount(page, accountName);
    }
  });
  test.describe("pie chart with positive net", () => {
    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "e2e/.auth/user.json",
      });
      const page = await context.newPage();

      await page.goto("/accounts");

      while (true) {
        const card = page
          .locator(".rounded-lg.border")
          .filter({ hasText: DASHBOARD_PIE_ACCOUNT })
          .first();
        if (!(await card.isVisible({ timeout: 2000 }).catch(() => false)))
          break;
        await card.locator("button:has(.lucide-trash-2)").click();
        await page.getByRole("button", { name: "Delete" }).click();
        await page.waitForSelector('[role="dialog"]', { state: "hidden" });
        await page.waitForTimeout(300);
      }

      await page.getByRole("button", { name: "Add account" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator('input[name="name"]').fill(DASHBOARD_PIE_ACCOUNT);
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "CommBank" }).click();
      await dialog.getByRole("button", { name: "Create account" }).click();
      await page.waitForSelector(`text=${DASHBOARD_PIE_ACCOUNT}`);

      await context.close();
    });

    test("include net adds Unspent slice and Income allocation title", async ({
      page,
    }) => {
      const now = new Date();
      const seedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const seed = await page.request.post("/api/test-seed-transactions", {
        data: {
          accountName: DASHBOARD_PIE_ACCOUNT,
          count: 2,
          reset: true,
          seedMonth,
          addIncome: true,
        },
      });
      expect(seed.ok()).toBeTruthy();

      await page.goto(`/dashboard?month=${seedMonth}`);
      await expect(page.getByText(/monthly overview/i)).toBeVisible({
        timeout: 10000,
      });

      const slider = page.getByRole("slider", { name: /include net/i });
      await expect(slider).not.toHaveAttribute("data-disabled");
      await slider.focus();
      await page.keyboard.press("End");
      await expect(
        page.getByText("Income allocation", { exact: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Unspent", { exact: true })).toBeVisible();
    });
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
