# Releasing

Releases are cut by the maintainer. **Nothing is published to npm without an explicit maintainer decision.**

## Checklist

1. Make sure `main` is green in CI (library on Node 22 and 24, plus demo QC).
2. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new version heading and update the compare links.
3. Bump the version: `npm version <patch|minor|major> --no-git-tag-version`.
4. Verify locally:
   ```bash
   npm ci && npm test && npm run pack:check
   cd examples/remotion-demo && npm ci && npm run qc
   ```
   Check the `pack:check` file list: `dist/`, `src/`, `README.md`, `LICENSE` and `CHANGELOG.md` only.
5. Open a PR titled `Release vX.Y.Z`, merge it, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
6. Create a GitHub Release from the tag and paste the changelog section.
7. **npm (first publish only after approval):**
   - Confirm the package name is still free: `npm view remotion-2d-rig-toolkit` should return 404.
   - Enable 2FA on the npm account.
   - Publish with provenance from CI, or locally with `npm publish --provenance --access public`.

## Versioning

[Semantic Versioning](https://semver.org/). While the version is below 1.0.0, a minor bump may contain breaking changes. They are always listed under **Changed** in the changelog with a "Possibly breaking" note.
