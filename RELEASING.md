# Releasing

Releases are fully automated with [release-please](https://github.com/googleapis/release-please). Versions, `CHANGELOG.md`, git tags, and GitHub Releases are derived from commit messages.

This project is a local LAN dashboard (not published to PyPI or npm). A release is the git tag + GitHub Release notes only.

## Flow

1. Open a PR with a **Conventional Commit title**. The squash-merge commit drives the next version.
2. Merge to `main`. release-please opens/updates a Release PR (`chore(main): release X.Y.Z`).
3. Merge the Release PR. release-please tags `vX.Y.Z` and creates the GitHub Release.

| PR title prefix | Version bump |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` / `BREAKING CHANGE:` | major |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:` | none |

## Branch protection

- Require a pull request before merging to `main`.
- Block force-pushes and deletions.
- Do **not** require status checks on the Release PR (GitHub does not run workflows for `GITHUB_TOKEN`-opened PRs).

### Actions permission (required once)

Under **Settings → Actions → General → Workflow permissions**:

1. Read and write permissions
2. Allow GitHub Actions to create and approve pull requests
