// DB cleanup is handled by the pretest:e2e npm script, which runs
// before Playwright starts (and before the webServer locks test.db).
export default async function globalSetup() {}
