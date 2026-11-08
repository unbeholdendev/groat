# Releasing Groat

Groat uses Apache-2.0; see [LICENSE](../LICENSE). Releases follow unbeholden-wallet: create a version tag on Forgejo, mirror it to GitHub, then build and publish the image with GitHub Actions. The workflow publishes the exact tag to `ghcr.io/unbeholdendev/groat`, initially for `linux/amd64`. Tags containing a hyphen are prereleases and do not update `latest`. The first release version still needs a maintainer decision.

Before tagging, verify that the Forgejo push mirror targets the GitHub repository `unbeholdendev/groat` and includes tags. Enable Actions on the GitHub mirror and allow its workflow token to write packages. The workflow uses GitHub's built-in `GITHUB_TOKEN`; no separate registry token is needed. After the first push, make the GHCR package public so installations can pull it without signing in.

On a clean Docker host, install from the chosen source ref as in the [README](../README.md). Check first-admin setup, a second setup refusal, an expense with a receipt photo, restart persistence, and a restore to an empty volume. Upgrade from the previous release with that data and verify it again. For the first release, record that no previous released version exists and test container replacement against the candidate image. Do not announce the release until these checks pass.

After the release workflow is merged, set `VERSION` to the approved `vX.Y.Z` tag and `REVISION` to the reviewed commit on Forgejo, then push only the tag:

```sh
git tag "$VERSION" "$REVISION"
git push origin "refs/tags/$VERSION"
```

The mirrored tag triggers `.github/workflows/release.yml` on GitHub. It runs API tests and typecheck, builds the app inside the Docker build, then publishes the image. Read the digest from that run's summary and verify it with:

```sh
docker buildx imagetools inspect "ghcr.io/unbeholdendev/groat:$VERSION"
```

Record the digest, source commit, architecture, checks performed and upgrade limitations in the release notes. A successful image build does not prove the clean-host and upgrade checks above. Keep existing release tags unchanged.
