# Install Groat with Docker

You need Docker Engine, Git and a host with disk space for your household's database and backups. You pay for that host and its storage. Optional AI providers may charge for text, receipt photos and audio; check their prices and spending limits before enabling them. A public demo is a separate, disposable instance. This installation creates your own household server, not an account on a hosted service.

## Use a release image

The release workflow publishes images to `ghcr.io/unbeholden/groat` for `linux/amd64`. After a release is published, set `VERSION` to its exact `vX.Y.Z` tag and pull it:

```sh
VERSION=vX.Y.Z
IMAGE="ghcr.io/unbeholden/groat:$VERSION"
docker pull "$IMAGE"
```

Choose a published version; `vX.Y.Z` is a placeholder. Use a version tag or digest for an installation. The `latest` tag moves on stable releases only. Prerelease tags such as `v0.1.0-alpha.1` publish only their versioned image; use that exact tag to test an early build. Check the GitHub Actions release run for the published digest. The first release version has not been chosen yet.

## Build from source instead

To build locally, use a reviewed source tag or full commit ID. Replace `SOURCE_REF` below with that ref; do not use a moving branch for a production install.

```sh
git clone https://git.home.unbeholden.dev/unbeholden/groat.git
cd groat
git checkout SOURCE_REF
REVISION=$(git rev-parse HEAD)
VERSION=$REVISION
IMAGE="groat:$VERSION"
docker build --pull --build-arg VERSION="$VERSION" \
  --build-arg REVISION="$REVISION" -t "$IMAGE" .
```

The Dockerfile pins the Bun base image by digest and installs dependencies from `bun.lock` with `--frozen-lockfile`. Both stages use the same base. Keep the source revision and image tag with your deployment records. A maintainer can use a release tag as `VERSION` instead of the commit ID. This fixes the build inputs; it does not promise byte-identical image output.

## Start and set up

Run these commands in the same shell as the pull or build. Create an empty environment file even if you do not use AI. Keep it outside the source checkout and out of version control.

```sh
install -m 600 /dev/null "$HOME/groat.env"
docker volume create groat-data
docker run -d --name groat --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --mount source=groat-data,target=/data \
  --env-file "$HOME/groat.env" "$IMAGE"
docker logs groat
curl --fail http://127.0.0.1:3000/api/session
```

A fresh instance returns `{"setup":true,"user":null}`. Open `http://localhost:3000` on the Docker host, create the first account and check that it is an admin. For a remote host, use an SSH tunnel before exposing the server:

```sh
ssh -L 3000:127.0.0.1:3000 your-server
```

Anyone who reaches an unconfigured instance can create its first admin. Complete setup before opening access. Add other household members after signing in. To test persistence, add an expense, run `docker restart groat`, then sign in and check that the expense remains.

The named volume survives container removal. Do not remove `groat-data` during an upgrade. The database includes receipt attachments; no second attachment mount is needed.

| Setting | Default and use |
|---|---|
| Volume | Mount persistent storage at `/data`. |
| `DB_PATH` | `/data/expenses.db`. Keep any custom path inside the persistent mount. |
| `PORT` | `3000` inside the container. If changed, change the container side of the port mapping too. |
| `NODE_ENV` | `production` in the image. |
| `AI_*` | Unset; AI is optional. See [AI features](../README.md#ai-features) for the variables. |

Edit `groat.env` to set environment variables, one `NAME=value` per line. Recreate the container with the same volume and `--env-file` to apply changes. Restarting alone does not reload the file. Keep a protected copy of the environment alongside your backups; the app's backup omits it.

## HTTPS and reverse proxy

For access from phones or outside the host, put a reverse proxy with a valid HTTPS certificate in front of port 3000. HTTPS is needed for browser microphone access and service workers outside localhost. Point your domain at the host and allow HTTPS through its firewall. Keep port 3000 on loopback; expose only the proxy.

For Caddy running on the same host, replace the hostname in this Caddyfile entry:

```caddyfile
expenses.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

If the proxy runs in Docker, connect both containers to a private Docker network and proxy to `groat:3000` instead. The proxy must forward the original host and set `X-Forwarded-Proto: https` for HTTPS requests, overwriting any client-supplied value. Groat uses that header to set secure session cookies. Check sign-in through the HTTPS address before sharing it. Allow request bodies of at least 128 MB if you intend to restore backups through the proxy.

## Back up and upgrade

Use the [backup and restore instructions](../README.md#backup-and-restore), tracked in [#102](https://git.home.unbeholden.dev/unbeholden/groat/issues/102). Download an admin backup before every upgrade and record the current image tag and environment. Keep backups on separate storage and test restoring one into an empty volume.

Pull the new release image (or build the new source ref) as above, updating `VERSION` and `IMAGE`, then replace the container:

```sh
docker stop groat
docker rm groat
docker run -d --name groat --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --mount source=groat-data,target=/data \
  --env-file "$HOME/groat.env" "$IMAGE"
docker logs groat
```

Migrations run automatically at startup. Sign in and check the saved expense, settings and any receipt photos. Check that first-admin setup stays closed. If an upgrade fails, stop it and preserve its volume for diagnosis. Restore the pre-upgrade backup into a separate empty volume with the old image and saved environment; do not run an older image against a database the new image has migrated.

## Maintainer release checklist

Groat uses Apache-2.0; see [LICENSE](../LICENSE). Releases follow unbeholden-wallet: create a version tag on Forgejo, mirror it to GitHub, then build and publish the image with GitHub Actions. The workflow publishes the exact tag to `ghcr.io/unbeholden/groat`, initially for `linux/amd64`. Tags containing a hyphen are prereleases and do not update `latest`. The first release version still needs a maintainer decision.

Before tagging, verify that the Forgejo push mirror targets the GitHub repository `unbeholden/groat` and includes tags. Enable Actions on the GitHub mirror and allow its workflow token to write packages. The workflow uses GitHub's built-in `GITHUB_TOKEN`; no separate registry token is needed. After the first push, make the GHCR package public so installations can pull it without signing in.

On a clean Docker host, follow this guide from the chosen source ref. Check first-admin setup, a second setup refusal, an expense with a receipt photo, restart persistence, and a restore to an empty volume. Upgrade from the previous release with that data and verify it again. For the first release, record that no previous released version exists and test container replacement against the candidate image. Do not announce the release until these checks pass.

After the release workflow is merged, set `VERSION` to the approved `vX.Y.Z` tag and `REVISION` to the reviewed commit on Forgejo, then push only the tag:

```sh
git tag "$VERSION" "$REVISION"
git push origin "refs/tags/$VERSION"
```

The mirrored tag triggers `.github/workflows/release.yml` on GitHub. It runs API tests and typecheck, builds the app inside the Docker build, then publishes the image. Read the digest from that run's summary and verify it with:

```sh
docker buildx imagetools inspect "ghcr.io/unbeholden/groat:$VERSION"
```

Record the digest, source commit, architecture, checks performed and upgrade limitations in the release notes. A successful image build does not prove the clean-host and upgrade checks above. Keep existing release tags unchanged.
