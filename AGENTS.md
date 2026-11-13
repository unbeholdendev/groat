## Agent skills

### Issue tracker

Forgejo issues on git.home.unbeholden.dev/unbeholden/groat, via `tea`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

### Browser tests

`bun run e2e` builds the app and drives it with Playwright (WebKit phone, Chromium desktop) against `e2e/server.ts`: an in-memory DB with stubbed rates and AI, reset per test. First time: `bunx playwright install chromium webkit`; the NixOS host supplies the system libraries (nix-ld), so skip `--with-deps`.

### Lint and format

Run `bun run lint` before committing; it must pass. `bun run format` fixes layout.
