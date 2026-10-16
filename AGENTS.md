## Agent skills

### Issue tracker

Forgejo issues on git.unbeholden.dev/unbeholden/expense-tracker, via the forgejo MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Browser tests

`bun run e2e` builds the app and drives it with Playwright (WebKit phone, Chromium desktop) against `e2e/server.ts`: an in-memory DB with stubbed rates and AI, reset per test. First time: `bunx playwright install --with-deps chromium webkit`.
