# Releasing

Releases are fully automated with [release-please](https://github.com/googleapis/release-please). Versions, `CHANGELOG.md`, git tags, and GitHub Releases are derived from commit messages — none are edited or run by hand.

This project is a local LAN dashboard (not published to PyPI or npm). A release is the git tag + GitHub Release notes only.

## Flow

1. A branch is created and changes are committed.
2. A PR is opened with a **Conventional Commit title**. The title determines the next version when the PR is squash-merged into `main`:

   | PR title prefix | Example | Version bump |
   |---|---|---|
   | `fix:` | `fix: stabilize mute slider updates` | patch |
   | `feat:` | `feat: add multi-room group create` | minor |
   | `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer | `feat!: require Node 22` | major |
   | `chore:`, `docs:`, `refactor:`, `test:`, `ci:` | `docs: fix typo` | no release |

3. The **Tests** (and CodeQL) workflows run on the PR. The PR is squash-merged to `main`.
4. **release-please** opens or updates a **Release PR** titled `chore(main): release X.Y.Z`. It bumps versions in `.release-please-manifest.json`, `backend`/`frontend` package metadata, and appends to `CHANGELOG.md`. Multiple code PRs merged before a release are batched into one Release PR.
5. Merging the Release PR triggers `release.yml` again, which creates the `vX.Y.Z` git tag and publishes a GitHub Release.

## Branch protection

`main` should stay compatible with this flow:

- **Require a pull request before merging** (0 required approvals is fine for a solo maintainer).
- **Block force-pushes and deletions.**
- **Do not require status checks on the Release PR.** GitHub does not trigger workflows for PRs opened by the built-in `GITHUB_TOKEN` (loop prevention), so a required check would leave every Release PR permanently unmergeable. Code PRs still run Tests/CodeQL; review those before merging.

### Actions permission (required once)

Under **Settings → Actions → General → Workflow permissions**:

1. **Read and write permissions**
2. **Allow GitHub Actions to create and approve pull requests**

Without (2), release-please can update its branch but cannot open the Release PR.

## Notes

- **PR titles drive releases.** With squash merges, the PR title becomes the commit release-please reads.
- **Version source of truth** is `.release-please-manifest.json`. Do not hand-edit version fields for routine releases.
- Behavior is configured in `release-please-config.json`.
