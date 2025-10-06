# GitHub Actions Release Automation - Visual Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenLeague Release Automation                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│  Pull Request    │────────▶│  Version Check   │────────▶│  Comment on PR   │
│  to main         │         │  Workflow        │         │  with Analysis   │
│                  │         │                  │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │                  │
                            │  Validate        │
                            │  Version Bump    │
                            │                  │
                            └──────────────────┘


┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│  Push to main    │────────▶│  Release         │────────▶│  Analyze         │
│  branch          │         │  Workflow        │         │  Commits         │
│                  │         │                  │         │                  │
└──────────────────┘         └──────────────────┘         └────────┬─────────┘
                                                                    │
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Determine       │
                                                          │  Version Bump    │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Quality Checks  │
                                                          │  (Type, Lint,    │
                                                          │   Build)         │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Update          │
                                                          │  package.json    │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Create Git Tag  │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Generate        │
                                                          │  Changelog       │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Create GitHub   │
                                                          │  Release         │
                                                          │                  │
                                                          └──────────────────┘


┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│  Push Git Tag    │────────▶│  Tag Release     │────────▶│  Validate        │
│  (v*.*.*)        │         │  Workflow        │         │  Semver Format   │
│                  │         │                  │         │                  │
└──────────────────┘         └──────────────────┘         └────────┬─────────┘
                                                                    │
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Quality Checks  │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Generate        │
                                                          │  Release Notes   │
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │                  │
                                                          │  Create GitHub   │
                                                          │  Release         │
                                                          │                  │
                                                          └──────────────────┘
```

## Commit Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Commit Messages                              │
└─────────────────────────────────────────────────────────────────────┘

feat: add new feature ──────────────▶ MINOR version bump (0.X.0)
                                     Example: 0.1.0 → 0.2.0

fix: resolve bug ──────────────────▶ PATCH version bump (0.0.X)
                                     Example: 0.2.0 → 0.2.1

feat!: breaking change ─────────────▶ MAJOR version bump (X.0.0)
BREAKING CHANGE: details            Example: 0.2.1 → 1.0.0

docs: update documentation ─────────▶ NO version bump
chore: maintenance tasks            (No release triggered)
```

## File Organization

```
.github/
│
├── workflows/                      # GitHub Actions workflows
│   ├── release.yml                 # Main automated release
│   ├── tag-release.yml             # Manual tag releases
│   ├── version-check.yml           # PR version validation
│   └── README.md                   # Workflow documentation
│
├── release.yml                     # Release notes config
├── RELEASE_TEMPLATE.md             # Release checklist
├── CONTRIBUTING.md                 # Contribution guide
├── AUTOMATION.md                   # Quick reference
└── SETUP_SUMMARY.md                # Complete setup guide
```

## Quick Reference Card

```
╔════════════════════════════════════════════════════════════════╗
║                 OpenLeague Release Quick Ref                   ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  AUTOMATIC RELEASE                                             ║
║  ────────────────────────────────────────────────────────────  ║
║  git commit -m "feat: new feature"                             ║
║  git push origin main                                          ║
║  → Automatic release triggered                                 ║
║                                                                ║
║  MANUAL RELEASE (specific version)                             ║
║  ────────────────────────────────────────────────────────────  ║
║  gh workflow run release.yml -f version=1.2.3                  ║
║  → Release v1.2.3 created                                      ║
║                                                                ║
║  MANUAL RELEASE (via tag)                                      ║
║  ────────────────────────────────────────────────────────────  ║
║  git tag -a v1.2.3 -m "Release v1.2.3"                         ║
║  git push origin v1.2.3                                        ║
║  → Release v1.2.3 created                                      ║
║                                                                ║
║  COMMIT TYPES                                                  ║
║  ────────────────────────────────────────────────────────────  ║
║  feat:          → Minor bump (0.X.0)                           ║
║  fix:           → Patch bump (0.0.X)                           ║
║  feat! / BREAKING → Major bump (X.0.0)                         ║
║  docs/chore/etc → No release                                   ║
║                                                                ║
║  QUALITY CHECKS (must pass)                                    ║
║  ────────────────────────────────────────────────────────────  ║
║  ✓ bun run type-check                                          ║
║  ✓ bun run lint                                                ║
║  ✓ bun run build                                               ║
║                                                                ║
║  VIEW RELEASES                                                 ║
║  ────────────────────────────────────────────────────────────  ║
║  gh release list              # List all releases              ║
║  gh release view v1.2.3       # View specific release          ║
║  gh run list                  # View workflow runs             ║
║                                                                ║
║  SKIP CI                                                       ║
║  ────────────────────────────────────────────────────────────  ║
║  git commit -m "docs: update [skip ci]"                        ║
║  → No release triggered                                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

## Workflow Trigger Matrix

| Event | Workflow | Action | Result |
|-------|----------|--------|--------|
| Push to `main` | `release.yml` | Analyze commits, determine version | Automated release |
| Push tag `v*.*.*` | `tag-release.yml` | Validate tag, run checks | Release from tag |
| PR to `main` (package.json) | `version-check.yml` | Compare versions | PR comment + validation |
| Manual dispatch | `release.yml` | Use specified version | Manual release |
| Commit with `[skip ci]` | None | Skip all workflows | No action |

## Version Bump Matrix

| Last Version | Commit Type | New Version | Example |
|--------------|-------------|-------------|---------|
| 0.1.0 | `feat:` | 0.2.0 | Minor bump |
| 0.2.0 | `fix:` | 0.2.1 | Patch bump |
| 0.2.1 | `feat!:` | 1.0.0 | Major bump |
| 1.0.0 | `docs:` | 1.0.0 | No change |
| 1.0.0 | `chore:` | 1.0.0 | No change |

## Changelog Category Mapping

| PR Label | Changelog Section | Emoji |
|----------|------------------|-------|
| `breaking-change` | Breaking Changes | 🚨 |
| `feature`, `enhancement` | New Features | ✨ |
| `bug`, `fix` | Bug Fixes | 🐛 |
| `documentation` | Documentation | 📚 |
| `infrastructure`, `ci` | Infrastructure | 🏗️ |
| `style`, `ui` | Styling | 🎨 |
| `performance` | Performance | ⚡ |
| `security` | Security | 🔒 |
| `test` | Testing | 🧪 |

## Status Indicators

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ All checks passed | Ready for release | Automatic release proceeds |
| ⚠️ Version unchanged | No version bump in PR | Consider bumping version |
| ❌ Check failed | Quality check failed | Fix errors before release |
| 🟢 Patch bump | Bug fix release | Safe to merge |
| 🟡 Minor bump | New feature release | Review features |
| 🔴 Major bump | Breaking change | Review carefully |

## Common Commands

```bash
# Development
bun run dev              # Start dev server
bun run type-check       # Check types
bun run lint             # Lint code
bun run build            # Build project

# Releases
gh release list          # List releases
gh release view          # View latest release
gh run watch             # Watch workflow run

# Git
git tag -l               # List tags
git describe --tags      # Show latest tag
git log --oneline -10    # View recent commits

# Troubleshooting
gh run list --workflow=release.yml --limit 3
gh run view <run-id> --log
```

## Documentation Links

- **Quick Start**: `.github/AUTOMATION.md`
- **Detailed Guide**: `.github/workflows/README.md`
- **Release Checklist**: `.github/RELEASE_TEMPLATE.md`
- **Contributing**: `.github/CONTRIBUTING.md`
- **Complete Setup**: `.github/SETUP_SUMMARY.md`

---

**Print this page and keep it handy for quick reference! 📋**
