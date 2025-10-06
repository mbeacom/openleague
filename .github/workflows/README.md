# GitHub Actions Workflows

This directory contains automated workflows for the OpenLeague project.

## Workflows Overview

### 1. Release Workflow (`release.yml`)

**Trigger**: Push to `main` branch or manual dispatch

**Purpose**: Automatically creates releases with semantic versioning

**Features**:
- Automatically determines version bump based on commit messages
- Updates `package.json` version
- Creates Git tags
- Generates changelog from commits
- Creates GitHub release
- Runs quality checks (type-check, lint, build)

**Commit Message Convention**:
- `feat:` or `feature:` → Minor version bump (0.X.0)
- `fix:` or `bugfix:` → Patch version bump (0.0.X)
- `feat!:` or `BREAKING CHANGE:` → Major version bump (X.0.0)

**Manual Trigger**:
```bash
# Via GitHub CLI
gh workflow run release.yml -f version=1.2.3

# Or via GitHub UI: Actions → Release → Run workflow
```

### 2. Tag Release Workflow (`tag-release.yml`)

**Trigger**: Push of tags matching `v*.*.*` pattern

**Purpose**: Validates and creates releases from manual tags

**Features**:
- Validates semantic versioning format
- Runs quality checks before release
- Generates categorized release notes
- Supports pre-release tags (e.g., `v1.0.0-beta.1`)

**Usage**:
```bash
# Create and push tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

### 3. Version Check Workflow (`version-check.yml`)

**Trigger**: Pull requests to `main` that modify `package.json`

**Purpose**: Validates version bumps in PRs

**Features**:
- Compares PR version with base branch version
- Validates semantic versioning rules
- Posts comment on PR with version bump details
- Fails on invalid version changes

**Validation Rules**:
- Version must increase monotonically
- Must follow semantic versioning format (X.Y.Z)
- Warns if version is unchanged

## Release Configuration

### `release.yml`

GitHub's built-in release notes configuration that categorizes PRs by labels:

**Categories**:
- 🚨 Breaking Changes
- ✨ New Features
- 🐛 Bug Fixes
- 📚 Documentation
- 🏗️ Infrastructure
- 🔧 Configuration
- 🎨 Styling
- ⚡ Performance
- 🔒 Security
- 🧪 Testing
- 📦 Dependencies
- 🔄 Other Changes

**Excluded**:
- PRs labeled with `ignore-for-release`, `skip-changelog`
- Dependabot PRs
- GitHub Actions bot commits

## How to Create a Release

### Automatic Release (Recommended)

Simply merge to `main` and the workflow handles everything:

```bash
git checkout main
git pull
git merge feature-branch
git push
```

The workflow will:

1. Analyze commit messages since last release
2. Determine appropriate version bump
3. Update `package.json`
4. Create Git tag
5. Generate changelog
6. Publish GitHub release

### Manual Release with Specific Version

```bash
# Option 1: Use workflow dispatch
gh workflow run release.yml -f version=1.2.3

# Option 2: Create tag manually
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

### Pre-Release Versions

For beta/alpha releases:

```bash
git tag -a v1.0.0-beta.1 -m "Beta release"
git push origin v1.0.0-beta.1
```

## Semantic Versioning Guide

Follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

**Pre-release suffixes** (optional):
- `-alpha.1`, `-beta.2`, `-rc.1`

**Build metadata** (optional):
- `+20130313144700`, `+exp.sha.5114f85`

## Commit Message Best Practices

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: New feature (minor bump)
- `fix`: Bug fix (patch bump)
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature/fix)
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

**Breaking Changes**:
```text
feat!: remove deprecated API endpoint

BREAKING CHANGE: The /api/old-endpoint has been removed.
Use /api/v2/new-endpoint instead.
```

## Workflow Permissions

All workflows require appropriate GitHub token permissions:

- `contents: write` - Create tags and releases
- `pull-requests: write` - Comment on PRs (version check)
- `issues: write` - Update issue references in releases

These are automatically provided by GitHub Actions.

## Troubleshooting

### Release Not Created

**Check**:
1. Did CI checks pass (type-check, lint, build)?
2. Is `[skip ci]` in the commit message?
3. Does the commit include actual changes?
4. Are there any merge conflicts?

### Invalid Version Error

**Ensure**:
- Version follows semantic versioning (X.Y.Z)
- Version increases from base branch
- No duplicate tags exist

### Manual Fixes

```bash
# Delete incorrect tag (local and remote)
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3

# Re-create with correct version
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Force update package.json
git checkout main
# Update version in package.json manually
git add package.json
git commit -m "chore: fix version to 1.2.3 [skip ci]"
git push
```

## Integration with Development Workflow

### Feature Branch → Main

```bash
# 1. Create feature branch
git checkout -b feat/new-roster-export

# 2. Make commits with conventional format
git commit -m "feat: add roster export to CSV"
git commit -m "fix: handle empty roster edge case"

# 3. Create PR to main
gh pr create --base main --title "Add roster export feature"

# 4. Merge PR (version-check workflow validates)
gh pr merge --merge

# 5. Automatic release triggered on main
# Version bumped from 0.1.0 → 0.2.0 (minor, because of 'feat')
```

### Hotfix Release

```bash
# 1. Create hotfix branch from main
git checkout -b hotfix/critical-bug

# 2. Fix and commit
git commit -m "fix: resolve critical RSVP crash"

# 3. Merge to main
gh pr create --base main --title "Hotfix: critical RSVP crash"
gh pr merge --merge

# 4. Automatic release triggered
# Version bumped from 0.2.0 → 0.2.1 (patch, because of 'fix')
```

## Related Documentation

- [Release Template](./RELEASE_TEMPLATE.md) - Full release checklist
- [Contributing Guide](../CONTRIBUTING.md) - Development workflow
- [Semantic Versioning](https://semver.org/) - Versioning specification
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit format

## Notes

- All workflows run on Ubuntu latest
- Bun is used as the package manager (not npm/yarn)
- Quality checks must pass before release creation
- Changelog is generated from Git history
- Failed releases don't create tags (safe to retry)
