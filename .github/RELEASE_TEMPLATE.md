# Release Checklist

Use this template when preparing a release.

## Pre-Release Checklist

- [ ] All tests passing
- [ ] Type checking passes (`bun run type-check`)
- [ ] Linting passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)
- [ ] Database migrations are up to date
- [ ] Environment variables documented (if new ones added)
- [ ] Breaking changes documented
- [ ] Migration guide prepared (if breaking changes)
- [ ] Deployment verified in staging environment

## Version Bump

Determine the version type based on changes:

- **Major (X.0.0)**: Breaking changes, incompatible API changes
- **Minor (x.X.0)**: New features, backward compatible
- **Patch (x.x.X)**: Bug fixes, backward compatible

## Creating a Release

### Automatic Release (Recommended)

Push to `main` branch and the release workflow will:

1. Automatically determine version based on commit messages
2. Update `package.json`
3. Create Git tag
4. Generate changelog
5. Create GitHub release

```bash
git checkout main
git pull
git merge your-feature-branch
git push
```

### Manual Release

If you need to specify a version:

```bash
# Trigger workflow manually with specific version
gh workflow run release.yml -f version=1.2.3
```

Or create a tag manually:

```bash
# Update version in package.json first
bun version 1.2.3

# Create and push tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

## Commit Message Convention

Follow conventional commits for automatic version detection:

- `feat:` or `feature:` - Minor version bump (new feature)
- `fix:` or `bugfix:` - Patch version bump (bug fix)
- `feat!:` or `BREAKING CHANGE:` - Major version bump (breaking change)
- `docs:` - Documentation only
- `chore:` - Maintenance tasks
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `perf:` - Performance improvements

Examples:

```text
feat: add roster export functionality
fix: resolve RSVP notification bug
feat!: redesign authentication system (breaking change)
```

## Post-Release Tasks

- [ ] Verify release published on GitHub
- [ ] Check deployment to production (Vercel)
- [ ] Update documentation if needed
- [ ] Announce release (if applicable)
- [ ] Monitor error tracking for new issues
- [ ] Close related issues/milestones

## Rollback Procedure

If issues are discovered after release:

1. **Quick Fix**: Create hotfix branch, fix, and create patch release
2. **Rollback**: Revert commits and create new patch release
3. **Emergency**: Manually revert deployment in Vercel

```bash
# For emergency rollback
git revert <commit-hash>
git push origin main
```

## Release Notes Template

```markdown
## What's Changed

### ⚠️ Breaking Changes
- List any breaking changes here

### ✨ Features
- New feature 1
- New feature 2

### 🐛 Bug Fixes
- Bug fix 1
- Bug fix 2

### 📦 Other Changes
- Dependency updates
- Documentation improvements

**Full Changelog**: https://github.com/mbeacom/openleague/compare/v1.0.0...v1.1.0
```

## Notes

- Releases are created automatically on push to `main`
- Manual releases can be triggered via workflow dispatch
- Version bumps follow semantic versioning
- Changelog is generated from commit messages
- Pre-releases can be created by pushing tags with suffixes (e.g., `v1.0.0-beta.1`)
