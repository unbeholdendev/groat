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

### Landing site

`site/` is the Astro landing page, with its own `package.json` (`cd site && bun install && bun run build`). It imports `shared/`, so its image builds from the repo root (`docker build --target site .`); the manual "Deploy site" Forgejo workflow pushes it to Dokploy on giran. `bun run clips [name…]` re-records the clips in `site/public/clips` against a seeded throwaway server and a real model. It needs ffmpeg, an emoji font, and `CLIPS_AI_URL`, `CLIPS_AI_KEY` and `CLIPS_AI_MODEL`; AI replies differ each run, so look at the clips before committing.
