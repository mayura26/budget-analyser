<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Testing Requirements
Whenever you add or modify a feature, you MUST also update the Playwright E2E tests in `e2e/tests/`.
- New pages → new `e2e/tests/<page>.spec.ts`
- Modified flows → update existing spec

Don't run tests again unless asked
