# Groat

A self-hosted expense tracker for one person or a group sharing a ledger.

## Run

```sh
touch groat.env
docker volume create groat-data
docker run -d --name groat --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --mount source=groat-data,target=/data \
  --env-file groat.env \
  ghcr.io/unbeholdendev/groat:vX.Y.Z
```

Use a released version tag; `latest` follows stable releases. To build the image yourself: `docker build -t groat .` in a checkout.

Open `http://localhost:3000` and create the first account, which becomes the admin. Anyone who reaches a fresh instance can do this, so finish setup before exposing it.

For phones or remote access, put an HTTPS reverse proxy in front of port 3000 that sets `X-Forwarded-Proto: https`. The microphone and offline mode need HTTPS.

Without Docker: `bun install && bun run build && bun start`.

To upgrade, download a backup, then replace the container with the new image on the same volume. Migrations run at startup.

## Configuration

Set these as environment variables, e.g. in `groat.env` (`NAME=value` per line) or `.env` from source. Recreate the container to apply changes.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `3000` | Port to listen on. |
| `DB_PATH` | `data.db` | SQLite database, including receipt photos. The image sets `/data/expenses.db`; change it only if your host forces a different mount path. |

All AI features are optional. To turn them on, an admin enters the base URL and API key of any OpenAI-compatible API in Settings → AI provider, plus a speech-to-text URL and key if dictation uses another service. That turns on asking (start the add bar with `?`), AI reading of unclear lines, receipt photos and dictation, with no restart. Saving checks the URL and key by listing the provider's models. Groat stores keys as plain text in the database and shows only their last 4 characters.

An admin then picks the chat, receipt photo and dictation models in Settings → AI models, from the list the provider returns. If the provider offers only one chat model, or one speech-to-text model, Groat uses it until an admin picks another.

### ChatGPT subscription

Each member can connect their own ChatGPT plan in Settings → ChatGPT subscription. Click **Connect ChatGPT**, open **Continue with ChatGPT**, and approve access. When the browser fails to open `127.0.0.1`, copy its full address into **Callback URL** in the original Groat tab, then click **Finish connection** within ten minutes. No local tool is needed. This manual callback variation still needs live OpenAI validation.

The connection takes priority over the shared API provider for that member's questions, unclear text and receipt photos. Other members cannot use it. Capture tokens continue to use the shared API provider. Dictation needs the shared API provider's speech-to-text setup; the subscription connection cannot transcribe audio. Subscription limits still apply.

Groat keeps OAuth credentials in a separate SQLite file beside `DB_PATH`, with `.chatgpt` appended, restricted to the server account. Keep this file on persistent storage. Credentials are not encrypted and are excluded from downloaded backups and AI SQL queries. Groat renews access automatically. Use **Reconnect ChatGPT** when access expires or is revoked, and **Disconnect ChatGPT** to remove the connection. Disconnecting Groat is separate from signing out of Groat.

## Backup and restore

An admin downloads a backup from Settings → Backup and import: one SQLite file with all data and password hashes, but not sign-ins, API tokens, chats or the AI provider URLs and keys. Keep it private. After a restore, an admin enters the AI provider again and members reconnect ChatGPT.

To restore, start the app on an empty `/data` with the same or a newer version, choose **Restore from a backup** on the welcome screen, then sign in. For scheduled backups, which also copy the AI keys:

```sh
sqlite3 /path/to/expenses.db ".backup '/backups/groat-$(date +%F).sqlite'"
```

On a new instance with no expenses yet, an admin can import a CSV in the export format from Settings → Backup and import.

## Capture from your phone

Create a token in Settings → API tokens, then post text to `/api/capture`, e.g. from an iOS Shortcut or Tasker:

```sh
curl -X POST https://your-host/api/capture \
  -H "Authorization: Bearer et_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "coffee 4.50"}'
```

## Lost admin password

Other members ask an admin to reset theirs under Members. If the admin is locked out:

```sh
docker stop groat
docker run --rm -it --volumes-from groat --entrypoint bun \
  "$(docker inspect --format '{{.Config.Image}}' groat)" server/recover-admin.ts
docker start groat
```

If you changed `DB_PATH`, add the same `-e DB_PATH=...` to the recovery container. From source: `bun server/recover-admin.ts`.

## Development

```sh
bun install
bun run dev    # API on :3000, the app on :38697
bun test
bun run e2e    # first time: bunx playwright install --with-deps chromium webkit
```

Releases: [docs/release.md](docs/release.md).

## Licence

[Apache License 2.0](LICENSE).
