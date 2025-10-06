# GitHub Actions Release Automation Setup# GitHub Actions Release Automation Setup



This document provides a comprehensive overview of the automated release system implemented for OpenLeague.This document provides a comprehensive overview of the automated release system implemented for OpenLeague.



## 📦 What Was Added## 📦 What Was Added



### GitHub Actions Workflows### GitHub Actions Workflows



Three automated workflows for releases:Three automated workflows for releases:



1. **`.github/workflows/release.yml`** - Main automated release workflow1. **`.github/workflows/release.yml`** - Main automated release workflow

2. **`.github/workflows/tag-release.yml`** - Tag-based release workflow2. **`.github/workflows/tag-release.yml`** - Tag-based release workflow

3. **`.github/workflows/version-check.yml`** - PR version validation3. **`.github/workflows/version-check.yml`** - PR version validation



### Configuration & Documentation### Configuration & Documentation



Configuration files and comprehensive documentation:Configuration files and comprehensive documentation:



1. **`.github/release.yml`** - GitHub release notes configuration1. **`.github/release.yml`** - GitHub release notes configuration

2. **`.github/RELEASE_TEMPLATE.md`** - Release checklist and guide2. **`.github/RELEASE_TEMPLATE.md`** - Release checklist and guide

3. **`.github/workflows/README.md`** - Detailed workflow documentation3. **`.github/workflows/README.md`** - Detailed workflow documentation

4. **`.github/CONTRIBUTING.md`** - Contribution guidelines4. **`.github/CONTRIBUTING.md`** - Contribution guidelines

5. **`.github/AUTOMATION.md`** - Quick reference guide for daily use5. **`.github/AUTOMATION.md`** - Quick reference guide for daily use

6. **`.github/VISUAL_GUIDE.md`** - Visual diagrams and quick reference6. **`.github/VISUAL_GUIDE.md`** - Visual diagrams and quick reference



For detailed descriptions of each component, see [AUTOMATION.md](./AUTOMATION.md) and [workflows/README.md](./workflows/README.md).For detailed descriptions of each component, see [AUTOMATION.md](./AUTOMATION.md) and [workflows/README.md](./workflows/README.md).



## 🎯 How It Works## 🎯 How It Works



See [AUTOMATION.md](./AUTOMATION.md) for the complete workflow, commit message conventions, and examples.See [AUTOMATION.md](./AUTOMATION.md) for the complete workflow, commit message conventions, and examples.



### Quick Overview### Quick Overview



The release workflow analyzes commit messages to determine version bumps:The release workflow analyzes commit messages to determine version bumps:



| Commit Pattern | Version Bump | Example || Commit Pattern | Version Bump | Example |

|---------------|--------------|---------||---------------|--------------|---------|

| `feat:` or `feature:` | **Minor** (0.X.0) | `feat: add CSV export` || `feat:` or `feature:` | **Minor** (0.X.0) | `feat: add CSV export` |

| `fix:` or `bugfix:` | **Patch** (0.0.X) | `fix: resolve RSVP bug` || `fix:` or `bugfix:` | **Patch** (0.0.X) | `fix: resolve RSVP bug` |

| `feat!:` or `BREAKING CHANGE:` | **Major** (X.0.0) | `feat!: redesign API` || `feat!:` or `BREAKING CHANGE:` | **Major** (X.0.0) | `feat!: redesign API` |



### Manual Release### Manual Release



```bash```bash

# Option 1: Workflow Dispatch# Option 1: Workflow Dispatch

gh workflow run release.yml -f version=1.2.3gh workflow run release.yml -f version=1.2.3



# Option 2: Git Tag# Option 2: Git Tag

git tag -a v1.2.3 -m "Release v1.2.3"git tag -a v1.2.3 -m "Release v1.2.3"

git push origin v1.2.3git push origin v1.2.3

``````



## ✅ Testing the SetupFor detailed examples, troubleshooting, and best practices, see:



To verify the automation works:- **Quick Reference**: [AUTOMATION.md](./AUTOMATION.md)

- **Technical Details**: [workflows/README.md](./workflows/README.md)

```bash- **Visual Guide**: [VISUAL_GUIDE.md](./VISUAL_GUIDE.md)

# 1. Create test branch- **Release Checklist**: [RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)

git checkout -b test/release-automation

## � Related Documentation

# 2. Make a small change

echo "# Test" >> docs/test.md```bash

git add docs/test.md# List recent runs

git commit -m "test: verify release automation"gh run list --workflow=release.yml --limit 5



# 3. Push to main (or create PR first)# Watch latest run

git checkout maingh run watch

git merge test/release-automation

git push origin main# View specific run

gh run view <run-id> --log

# 4. Watch workflow run```

gh run watch

### Check Release Status

# 5. Check release created

gh release list```bash

# List all releases

# 6. Verify version bumpedgh release list

cat package.json | jq .version

```# View latest release

gh release view --json tagName,publishedAt

## 📚 Complete Documentation

# View specific release

For detailed information, see:gh release view v1.2.3

```

- **[AUTOMATION.md](./AUTOMATION.md)** - Quick reference, examples, troubleshooting, best practices

- **[workflows/README.md](./workflows/README.md)** - Technical workflow details and integration### Check Version Info

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflow and contribution process

- **[RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)** - Release checklist for maintainers```bash

- **[VISUAL_GUIDE.md](./VISUAL_GUIDE.md)** - Visual diagrams and quick reference card# Current package.json version

cat package.json | jq .version

---

# Latest git tag

**Status**: ✅ Complete and ready to use!git describe --tags --abbrev=0



**Last Updated**: October 6, 2025# All tags

git tag -l

**Maintainer**: Mark Beacom (@mbeacom)```


## 🐛 Troubleshooting

### Release Didn't Trigger

**Symptoms**: Push to main but no release created

**Check**:
1. Does commit message contain `[skip ci]`?
2. Did quality checks pass?
3. Were there any actual changes?
4. Is the push actually on `main` branch?

**Solution**:
```bash
# View recent commits
git log --oneline -5

# Check workflow runs
gh run list --workflow=release.yml --limit 3
```

### Invalid Version Error

**Symptoms**: Version check workflow fails on PR

**Causes**:
- Version decreased instead of increased
- Version format invalid (not X.Y.Z)
- Version unchanged when it should change

**Solution**:
```bash
# Fix version in package.json
# Ensure it's higher than base branch
# Follow semantic versioning (X.Y.Z)
```

### Duplicate Tag Error

**Symptoms**: Tag already exists

**Solution**:
```bash
# Delete local tag
git tag -d v1.2.3

# Delete remote tag
git push origin :refs/tags/v1.2.3

# Re-create with correct version
git tag -a v1.2.4 -m "Release v1.2.4"
git push origin v1.2.4
```

## 🎓 Best Practices

### Do's ✅

- ✅ Use conventional commit format consistently
- ✅ Let automation handle version bumps
- ✅ Review version-check comments on PRs
- ✅ Run quality checks locally before pushing
- ✅ Use descriptive commit messages
- ✅ Group related changes in single commit

### Don'ts ❌

- ❌ Manually edit version in package.json on main
- ❌ Create duplicate tags
- ❌ Skip CI checks
- ❌ Force push to main branch
- ❌ Ignore workflow failures
- ❌ Mix multiple change types in one commit

## 📚 Related Documentation

- [Workflows README](.github/workflows/README.md) - Detailed workflow documentation
- [Contributing Guide](.github/CONTRIBUTING.md) - Development workflow
- [Release Template](.github/RELEASE_TEMPLATE.md) - Release checklist
- [Automation Summary](.github/AUTOMATION.md) - Quick reference guide

## 🔄 Future Enhancements

Potential improvements for the release automation:

- [ ] Automated testing integration
- [ ] Docker image building and publishing
- [ ] npm package publishing (if applicable)
- [ ] Slack/Discord notifications
- [ ] Deployment status checks
- [ ] Rollback automation
- [ ] Release branch strategy
- [ ] Automated security scanning

## 📞 Support

If you encounter issues:

1. Check [Troubleshooting](#-troubleshooting) section
2. Review [workflow logs](https://github.com/mbeacom/openleague/actions)
3. Read related documentation
4. Open an issue with `ci` label

## ✅ Testing the Setup

To verify the automation works:

```bash
# 1. Create test branch
git checkout -b test/release-automation

# 2. Make a small change
echo "# Test" >> docs/test.md
git add docs/test.md
git commit -m "test: verify release automation"

# 3. Push to main (or create PR first)
git checkout main
git merge test/release-automation
git push origin main

# 4. Watch workflow run
gh run watch

# 5. Check release created
gh release list

# 6. Verify version bumped
cat package.json | jq .version
```

---

**Status**: ✅ Complete and ready to use!

**Last Updated**: October 5, 2025

**Maintainer**: Mark Beacom (@mbeacom)
