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

## AI features

Off until you point the app at an OpenAI-compatible API (anything that serves `/chat/completions`). Until then the camera and mic in the add bar are dimmed, and tapping one says what is missing.

| Variable | Turns on |
|---|---|
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Asking: start the add bar with `?`. Unclear lines are read by AI for you to check. |
| `AI_VISION_MODEL` | Adding from a receipt photo. Needs the three above. |
| `AI_STT_MODEL` | Dictation. Needs the three above. Set `AI_STT_BASE_URL` and `AI_STT_KEY` if speech-to-text uses another provider. |

Set them in the container's environment, or in `.env` when running from source.

## Development

```sh
bun install
bun run dev    # API on :3000, the app on :38697
bun test       # server tests
bun run e2e    # browser tests (Playwright, phone and desktop)
```

The first `bun run e2e` needs the browsers: `bunx playwright install --with-deps chromium webkit`.
