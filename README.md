# Expense tracker

Self-hosted expense tracker. Run it with Docker; data lives in `/data`, the app on port 3000.

## Capture from your phone

Create a token in Settings, under API tokens. A token can only add expenses, as the user who made it. Post text to `/api/capture`:

```sh
curl -X POST https://your-host/api/capture \
  -H "Authorization: Bearer et_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "coffee 4.50"}'
```

The text is read like the add bar. If it has an amount and the note matches a past expense, it saves straight away. Otherwise it waits on Home as pending, for you to check and confirm.

### iOS Shortcut

1. New shortcut. Add **Dictate Text** (or **Ask for Input** to type).
2. Add **Get Contents of URL**:
   - URL: `https://your-host/api/capture`
   - Method: POST
   - Headers: `Authorization` = `Bearer et_...`
   - Request Body: JSON, with key `text` set to the dictated text.
3. Add it to the Home Screen or run it with "Hey Siri".

On Android, Tasker's **HTTP Request** action does the same.

## Development

```sh
bun install
bun run dev    # API on :3000, the app on :38697
bun test       # server tests
bun run e2e    # browser tests (Playwright, phone and desktop)
```

The first `bun run e2e` needs the browsers: `bunx playwright install --with-deps chromium webkit`.
