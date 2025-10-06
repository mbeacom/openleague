# Contributing to OpenLeague

Thank you for your interest in contributing to OpenLeague! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22+
- Bun (latest version)
- PostgreSQL (via Neon or local)
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/mbeacom/openleague.git
cd openleague

# Install dependencies
bun install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your database credentials

# Setup database
bunx prisma migrate dev

# Start development server
bun run dev
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

Branch naming conventions:

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

### 2. Make Your Changes

Follow the project conventions:

- Use TypeScript for all code
- Follow MUI styling patterns
- Use Server Actions for mutations
- Add Zod validation for inputs
- Write mobile-first responsive code

### 3. Commit Your Changes

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git add .
git commit -m "feat: add roster export to CSV"
```

**Commit types**:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Code style changes
- `refactor:` - Code restructuring
- `perf:` - Performance improvements
- `test:` - Tests
- `chore:` - Maintenance

**Breaking changes**:

```bash
git commit -m "feat!: redesign authentication

BREAKING CHANGE: Old auth tokens are no longer valid"
```

### 4. Test Your Changes

```bash
# Type checking
bun run type-check

# Linting
bun run lint

# Build
bun run build

# Run database migrations (if applicable)
bunx prisma migrate dev
```

### 5. Push and Create PR

```bash
git push origin feat/your-feature-name

# Create PR via GitHub CLI
gh pr create --base main --title "Add roster export feature" --body "Description of changes"

# Or via GitHub web interface
```

### 6. PR Review Process

- Version check workflow validates package.json changes
- CI checks must pass (type-check, lint, build)
- At least one approval required
- Admin will handle version bumps if needed

### 7. After Merge

Once merged to `main`, the release workflow automatically:

- Determines version bump from commits
- Updates package.json
- Creates Git tag
- Generates changelog
- Publishes GitHub release
- Deploys to Vercel

## Code Style Guide

### TypeScript

- Use strict mode (enabled in tsconfig.json)
- Define interfaces for all data structures
- Use Zod for runtime validation
- Prefer type inference when obvious

### React Components

```typescript
// Server Components (default)
export default async function RosterPage() {
  const roster = await getRoster();
  return <RosterList roster={roster} />;
}

// Client Components (when needed)
'use client';
export function RSVPButton({ eventId }: { eventId: string }) {
  // Client-side interactivity
}
```

### Server Actions

```typescript
'use server';

export async function createEvent(data: CreateEventInput) {
  // 1. Authenticate
  const session = await requireAuth();
  if (!session.user?.id) throw new Error('Unauthorized');

  // 2. Validate
  const validated = eventSchema.parse(data);

  // 3. Authorize
  const member = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, teamId: data.teamId, role: 'ADMIN' }
  });
  if (!member) throw new Error('Admin access required');

  // 4. Execute
  return await prisma.event.create({ data: validated });
}
```

### MUI Styling

```typescript
import { Box, Button } from '@mui/material';

export function MyComponent() {
  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: 2,
      }}
    >
      <Button variant="contained" color="primary">
        Action
      </Button>
    </Box>
  );
}
```

## Testing

Currently using manual testing. Automated tests coming soon.

### Manual Testing Checklist

- [ ] Desktop view (1920x1080)
- [ ] Tablet view (768x1024)
- [ ] Mobile view (375x667)
- [ ] Touch targets ≥ 44x44px
- [ ] All forms validate correctly
- [ ] Error states display properly
- [ ] Loading states work
- [ ] Database changes persist

## Database Changes

### Creating Migrations

```bash
# Make changes to prisma/schema.prisma

# Create migration
bunx prisma migrate dev --name describe_your_change

# Generate Prisma client
bunx prisma generate
```

### Migration Best Practices

- Name migrations descriptively
- Test migrations on development database first
- Consider data migration for schema changes
- Document breaking schema changes

## Release Process

Releases are automated but you should understand the flow:

### Version Bumping

Based on your commits:

- `feat:` commits → minor version (0.X.0)
- `fix:` commits → patch version (0.0.X)
- `feat!:` or `BREAKING CHANGE:` → major version (X.0.0)

### Creating a Release

**Automatic** (recommended):

```bash
# Just merge to main
git checkout main
git merge feat/your-feature
git push
```

**Manual** (if needed):

```bash
# Via GitHub CLI
gh workflow run release.yml -f version=1.2.3

# Via Git tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

See [Release Template](.github/RELEASE_TEMPLATE.md) for full checklist.

## MVP Scope

We're currently building the MVP. Please keep PRs focused on core features:

### ✅ In Scope

- Team management (single team)
- Roster management
- Event scheduling (games/practices)
- RSVP system
- Email notifications
- Admin/Member roles

### ❌ Out of Scope

- Payments/registration
- Multi-team/league views
- Stats tracking
- Public websites
- In-app messaging
- Advanced calendar features

If you're unsure, ask first!

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Feature Ideas**: Open a GitHub Issue (check MVP scope first)
- **Security**: Email [security@openl.app](mailto:security@openl.app)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## Recognition

Contributors will be recognized in:

- GitHub Contributors list
- Release notes (when applicable)
- Project README

Thank you for contributing to OpenLeague! 🎉
