# Groat

Groat is a self-hosted expense tracker. Run it with Docker; data lives in `/data`, the app on port 3000.

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

## Backup and restore

An admin downloads a backup from Settings, under Backup and import. It is one SQLite file, taken consistently while the app runs, with every expense (pending and binned too), category, tag, recurring schedule, rate, photo, setting and account. Password hashes are kept, so everyone signs in as before. Sign-ins, API tokens and chats are left out: after a restore, sign in again and make new tokens.

The file holds the household's spending and password hashes. Keep it private, e.g. `chmod 600`, and encrypt it if it leaves your machine.

The backup does not hold the container's environment: the `AI_*` variables, `PORT` and `DB_PATH`. Keep those, such as your compose file or `.env`, with the backup.

To restore:

1. Start the app with an empty `/data` volume, the same image version as the backup or newer.
2. Open it. On the welcome screen, choose **Restore from a backup** and pick the file.
3. Sign in with an account from the backup.

Restore only works before anyone signs up, so it can't overwrite a server in use. A file that isn't a backup, is damaged, or comes from a newer version of the app is refused and changes nothing. Backups from older versions are upgraded as they are restored. Uploads are limited to 128 MB.

For scheduled backups, copy the database from the host with SQLite's own tools, e.g. from cron:

```sh
sqlite3 /path/to/data/expenses.db ".backup '/backups/expenses-$(date +%F).sqlite'"
```

A copy made this way still has sign-ins and tokens in it.

## Importing expenses

On a new instance, before any expenses are added, an admin can import a CSV in the export format from Settings, under Backup and import. It shows a preview first. To move from Lofextra, see [docs/import-lofextra.md](docs/import-lofextra.md).

## Development

```sh
bun install
bun run dev    # API on :3000, the app on :38697
bun test       # server tests
bun run e2e    # browser tests (Playwright, phone and desktop)
```

The first `bun run e2e` needs the browsers: `bunx playwright install --with-deps chromium webkit`.

## Password recovery

Change your own password in Settings. If you forget it, ask a household admin to reset it under Household. There is no email reset.

If the admin is locked out, stop the container and run the offline recovery command against the same data volume. Replace `expenses` with your container name; use the same image as the stopped container:

```sh
docker stop expenses
docker run --rm -it --volumes-from expenses \
  --entrypoint bun "$(docker inspect --format '{{.Config.Image}}' expenses)" \
  server/recover-admin.ts
docker start expenses
```

Enter the admin username and the new password twice. Password input is hidden and never passed as a command argument. Recovery keeps expenses and API tokens, and signs out all sessions for that admin. If you set a custom `DB_PATH`, pass the same value to the recovery container with `-e DB_PATH=...`. For a source install, stop the server and run `DB_PATH=/path/to/expenses.db bun server/recover-admin.ts`.

## Backup and restore

Stop the container before copying data. Back up the whole `/data` directory, including attachments and any SQLite journal files, with ownership and permissions intact. Keep the image version with the backup.

```sh
docker stop expenses
docker cp -a expenses:/data ./expenses-backup
docker start expenses
```

To restore, stop the container, move its existing data aside, and copy the backup contents into its empty data volume. For a bind mount, replace `/srv/expenses` below with the host directory mounted at `/data`:

```sh
docker stop expenses
sudo mv /srv/expenses /srv/expenses.before-restore
sudo cp -a ./expenses-backup /srv/expenses
docker start expenses
```

For a named volume, use a temporary container with that volume mounted to replace its contents while the app is stopped. Preserve numeric ownership and permissions. Start with the image version recorded with the backup, then sign in and check expenses and attachments before upgrading. Do not copy a single database file from a running server.
