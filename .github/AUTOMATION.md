# GitHub Actions Automation Summary

## Overview

OpenLeague uses GitHub Actions to automate the entire release lifecycle, from version management to deployment.

## Active Workflows

| Workflow | Trigger | Status | Purpose |
|----------|---------|--------|---------|
| **Release** | Push to `main` | ![Release](https://github.com/mbeacom/openleague/workflows/Release/badge.svg) | Automated releases with semantic versioning |
| **Tag Release** | Push tag `v*.*.*` | ![Tag Release](https://github.com/mbeacom/openleague/workflows/Tag%20Release/badge.svg) | Release from manual tags |
| **Version Check** | PR to `main` | ![Version Check](https://github.com/mbeacom/openleague/workflows/Version%20Check/badge.svg) | Validate version bumps in PRs |

## Quick Start

### For Contributors

Commit with conventional format and merge to `main`:

```bash
git commit -m "feat: add new roster export feature"
git push origin main
```

Result: Automatic minor version bump (e.g., 0.1.0 → 0.2.0)

### For Maintainers

#### Manual Release

```bash
# Option 1: Workflow dispatch with specific version
gh workflow run release.yml -f version=1.2.3

# Option 2: Create and push tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

#### Emergency Hotfix

```bash
git checkout -b hotfix/critical-bug
git commit -m "fix: resolve critical security issue"
git push origin hotfix/critical-bug
gh pr create --base main
gh pr merge --merge  # Auto-release triggers on merge
```

## Commit Message Impact

| Commit Type | Example | Version Bump |
|-------------|---------|--------------|
| `feat:` | `feat: add CSV export` | Minor (0.X.0) |
| `fix:` | `fix: resolve RSVP bug` | Patch (0.0.X) |
| `feat!:` | `feat!: redesign API` | Major (X.0.0) |
| `docs:` | `docs: update README` | No bump |
| `chore:` | `chore: update deps` | No bump |

## Workflow Details

### 1. Release Workflow

**File**: `.github/workflows/release.yml`

**Process**:

1. Triggered on push to `main` or manual dispatch
2. Runs quality checks (type-check, lint, build)
3. Analyzes commits since last release
4. Determines semantic version bump
5. Updates `package.json`
6. Commits version change `[skip ci]`
7. Creates Git tag
8. Generates categorized changelog
9. Creates GitHub release
10. Notifies success

**Skip Release**: Include `[skip ci]` in commit message

### 2. Tag Release Workflow

**File**: `.github/workflows/tag-release.yml`

**Process**:

1. Triggered by pushing tag matching `v*.*.*`
2. Validates semantic versioning format
3. Runs quality checks
4. Generates release notes from commits
5. Creates GitHub release
6. Marks as pre-release if tag contains `-` (e.g., `v1.0.0-beta.1`)

### 3. Version Check Workflow

**File**: `.github/workflows/version-check.yml`

**Process**:

1. Triggered on PR to `main` modifying `package.json`
2. Compares PR version with base branch version
3. Validates version bump is valid and incremental
4. Posts comment on PR with analysis:
   - 🟢 Valid patch bump
   - 🟡 Valid minor bump
   - 🔴 Valid major bump
   - ⚠️ Version unchanged
   - ❌ Invalid version bump (fails CI)

## Release Configuration

### Changelog Categories

Defined in `.github/release.yml`:

- 🚨 Breaking Changes (`breaking-change`, `breaking`)
- ✨ New Features (`feature`, `enhancement`, `feat`)
- 🐛 Bug Fixes (`bug`, `fix`, `bugfix`)
- 📚 Documentation (`documentation`, `docs`)
- 🏗️ Infrastructure (`infrastructure`, `ci`, `cd`)
- 🔧 Configuration (`configuration`, `config`)
- 🎨 Styling (`style`, `styling`, `ui`, `ux`)
- ⚡ Performance (`performance`, `optimization`)
- 🔒 Security (`security`, `vulnerability`)
- 🧪 Testing (`test`, `testing`)
- 📦 Dependencies (`dependencies`, `deps`)
- 🔄 Other Changes (everything else)

### Excluded from Changelog

- PRs labeled: `ignore-for-release`, `skip-changelog`, `dependencies`
- Commits by: `dependabot`, `github-actions[bot]`

## Permissions Required

All workflows use `GITHUB_TOKEN` with:

- `contents: write` - Create tags and releases
- `pull-requests: write` - Comment on PRs
- `issues: write` - Update issues in releases

These are automatically provided by GitHub Actions.

## Best Practices

### Do's ✅

- Use conventional commit format
- Let automation handle version bumps
- Review version-check comments on PRs
- Use `[skip ci]` for documentation-only changes
- Create pre-release tags for beta versions (`v1.0.0-beta.1`)

### Don'ts ❌

- Don't manually edit version in package.json on `main`
- Don't create duplicate tags
- Don't skip CI checks
- Don't force push to `main`
- Don't create releases without testing

## Monitoring Releases

### View Releases

```bash
# List all releases
gh release list

# View specific release
gh release view v1.2.3

# Download release artifacts
gh release download v1.2.3
```

### View Workflow Runs

```bash
# List workflow runs
gh run list --workflow=release.yml

# View specific run
gh run view <run-id>

# Watch latest run
gh run watch
```

### Check Version

```bash
# Current package.json version
cat package.json | grep '"version"'

# Latest Git tag
git describe --tags --abbrev=0

# Latest GitHub release
gh release view --json tagName
```

## Troubleshooting

### Release Didn't Trigger

**Check**:

```bash
# View recent commits
git log --oneline -5

# Check for [skip ci]
git log --grep="\[skip ci\]" -5

# Verify push to main
git log origin/main -5
```

### Failed Release

**View logs**:

```bash
gh run list --workflow=release.yml --limit 1
gh run view <failed-run-id>
```

**Common fixes**:

- Fix type errors: `bun run type-check`
- Fix lint errors: `bun run lint`
- Fix build errors: `bun run build`

### Version Conflict

**Resolution**:

```bash
# Delete local and remote tag
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3

# Fix version in package.json
# Recommit and re-release
```

## Examples

### Example 1: Feature Release

```bash
# Work on feature
git checkout -b feat/csv-export
git commit -m "feat: add roster CSV export"
git commit -m "test: add export tests"

# Merge to main
git checkout main
git merge feat/csv-export
git push

# Result: v0.1.0 → v0.2.0 (minor bump)
```

### Example 2: Hotfix Release

```bash
# Fix critical bug
git checkout -b hotfix/rsvp-crash
git commit -m "fix: prevent RSVP null pointer exception"

# Merge to main
git checkout main
git merge hotfix/rsvp-crash
git push

# Result: v0.2.0 → v0.2.1 (patch bump)
```

### Example 3: Breaking Change Release

```bash
# Major refactor
git checkout -b refactor/auth-system
git commit -m "feat!: redesign authentication

BREAKING CHANGE: Old auth tokens no longer valid.
Users must re-authenticate after upgrade."

# Merge to main
git checkout main
git merge refactor/auth-system
git push

# Result: v0.2.1 → v1.0.0 (major bump)
```

## Additional Resources

- [Semantic Versioning Specification](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Release Template](./RELEASE_TEMPLATE.md)
- [Contributing Guide](./CONTRIBUTING.md)

## Support

If you encounter issues with the release automation:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [workflow logs](https://github.com/mbeacom/openleague/actions)
3. Open an issue with the `ci` label
4. Contact maintainers

---

**Note**: This automation is designed to be zero-touch for contributors. Just write good commit messages and merge to `main`! 🚀
