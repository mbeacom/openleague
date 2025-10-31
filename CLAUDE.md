# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenLeague is a free, open-source sports team management platform built with Next.js 15, React 19, and TypeScript. The application uses a modern stack with MUI v7, Prisma ORM with PostgreSQL (Neon), and Auth.js for authentication. The project follows a mobile-first design philosophy and uses Next.js Server Actions as the primary data mutation pattern.

## Development Commands

### Essential Commands
```bash
# Development
bun run dev              # Start dev server with Turbopack at localhost:3000
bun run dev:wake         # Wake database then start dev (for Neon serverless)
bun run build            # Production build
bun run start            # Start production server
bun run type-check       # TypeScript type checking (run before commits)
bun run lint             # ESLint

# Testing
bun run test             # Run tests with Vitest
bun run test:watch       # Run tests in watch mode
bun run test:coverage    # Generate coverage report
bun run test:ui          # Open Vitest UI

# Database Operations
bun run db:studio        # Open Prisma Studio (visual database browser)
bun run db:migrate       # Create and apply migration (development)
bun run db:migrate:deploy # Deploy migrations (production only)
bun run db:migrate:reset # Reset database - DESTRUCTIVE (dev only)
bun run db:generate      # Generate Prisma Client (run after schema changes)
bun run db:push          # Push schema changes without migration (dev prototyping)
bun run db:seed          # Run seed script
bun run db:wake          # Wake up Neon database (serverless)

# Utilities
bun run validate-env     # Validate environment variables
```

**Important**: Always use `bun` (not `npm` or `yarn`) for package management and running scripts.

### Single Test Execution
```bash
# Run a specific test file
bun run test __tests__/lib/utils/validation.test.ts

# Run tests matching a pattern
bun run test --grep "event validation"

# Watch a specific test file
bun run test:watch __tests__/lib/utils/validation.test.ts
```

## High-Level Architecture

### Tech Stack Philosophy
- **Framework**: Next.js 15 App Router (NOT Pages Router) with React 19
- **Data Mutations**: Server Actions first, API routes only for webhooks/external integrations
- **Data Fetching**: React Server Components by default, Client Components only when needed
- **Styling**: MUI v7 with Emotion (NOT Tailwind)
- **Database**: Prisma ORM with PostgreSQL - parameterized queries prevent SQL injection
- **Authentication**: Auth.js v5 with credential provider, bcrypt password hashing
- **Email**: Mailchimp Transactional Email (abstracted for future AWS SES migration)

### Application Structure

```
app/                              # Next.js App Router
├── (auth)/                      # Public auth routes (login, signup)
├── (marketing)/                 # Public marketing pages (about, pricing, etc.)
├── (dashboard)/                 # Protected routes requiring authentication
│   ├── layout.tsx               # Dashboard layout with navigation
│   ├── page.tsx                 # Team dashboard (default view)
│   ├── roster/                  # Roster management
│   ├── calendar/                # Event calendar views
│   ├── events/                  # Event creation and details
│   ├── league/                  # League management (if applicable)
│   └── admin/                   # Admin-only features
├── api/                         # API routes (minimal - prefer Server Actions)
│   ├── auth/[...nextauth]/      # Auth.js endpoints
│   ├── cron/                    # Scheduled jobs (RSVP reminders)
│   └── invitations/             # Invitation acceptance webhooks
└── docs/                        # Documentation pages

lib/                             # Core application logic
├── actions/                     # Server Actions (primary mutation method)
│   ├── auth.ts                  # Signup, login (no raw queries, uses Prisma)
│   ├── team.ts                  # Team CRUD
│   ├── roster.ts                # Player management
│   ├── events.ts                # Event scheduling
│   ├── rsvp.ts                  # Attendance tracking
│   ├── invitations.ts           # Email invitations
│   ├── league.ts                # League management
│   ├── communication.ts         # Messaging system
│   ├── notifications.ts         # Notification preferences
│   ├── permissions.ts           # Permission checks
│   ├── admin.ts                 # Admin operations
│   └── audit.ts                 # Audit logging
├── auth/                        # Authentication utilities
│   ├── config.ts                # Auth.js configuration
│   └── session.ts               # Session helpers (requireAuth, requireTeamAdmin, etc.)
├── db/
│   └── prisma.ts                # Prisma Client singleton
├── email/                       # Email service abstraction
│   ├── client.ts                # Mailchimp client
│   └── templates.ts             # Email templates
├── utils/                       # Shared utilities
│   ├── validation.ts            # Zod schemas
│   ├── date.ts                  # Date formatting
│   ├── permissions.ts           # Permission utilities
│   ├── security.ts              # Security utilities
│   ├── rate-limit.ts            # Rate limiting
│   └── error-handling.ts        # Error utilities
└── hooks/                       # React hooks for Client Components

prisma/
├── schema.prisma                # Database schema (single source of truth)
└── migrations/                  # Migration history
```

### Database Schema Architecture

The Prisma schema (`prisma/schema.prisma`) defines the complete data model:

**Core Models**:
- `User` - Authentication and user profiles
- `Team` - Team information (can be standalone or part of a league)
- `TeamMember` - Junction table linking users to teams with roles (ADMIN/MEMBER)
- `Player` - Roster entries (may or may not have User accounts)
- `Event` - Games and practices with scheduling
- `RSVP` - Attendance responses (GOING, NOT_GOING, MAYBE, NO_RESPONSE)
- `Invitation` - Email invitations with tokens and expiration

**League Models** (optional - teams can exist without leagues):
- `League` - Multi-team organization
- `Division` - Grouping within leagues (age groups, skill levels)
- `LeagueUser` - League membership with roles (LEAGUE_ADMIN, TEAM_ADMIN, MEMBER)
- `PlayerTransfer` - Audit trail for player moves between teams

**Communication Models**:
- `LeagueMessage` - Targeted messages to divisions/teams/entire league
- `MessageTargeting` - Defines message recipients
- `MessageRecipient` - Delivery tracking
- `NotificationPreference` - User notification settings
- `NotificationBatch` - Batched message delivery
- `BatchedMessage` - Individual messages in a batch

**Audit Model**:
- `AuditLog` - Administrative actions and security events

**Key Schema Patterns**:
1. Optional league relationships (`leagueId?`) allow teams to operate standalone or within leagues
2. Indexes on frequently queried fields (userId, teamId, leagueId, date ranges)
3. Cascading deletes (`onDelete: Cascade`) for proper cleanup
4. `@unique` constraints enforce data integrity

### Authentication Flow

**Pattern**: Every Server Action must validate authentication first
```typescript
// Standard auth pattern in Server Actions
const userId = await requireUserId(); // Throws and redirects if not authenticated
```

**Key Auth Helpers** (`lib/auth/session.ts`):
- `requireAuth()` - Redirects to login if not authenticated, returns session
- `requireUserId()` - Returns userId or redirects to login
- `requireTeamAdmin(teamId)` - Ensures user is ADMIN role for team
- `requireTeamMember(teamId)` - Ensures user belongs to team
- `requireLeagueRole(leagueId, role)` - Ensures user has required league role
- `isSystemAdmin(userId)` - Check if user is league admin

**Role Hierarchy**:
- **Team Level**: `ADMIN` (full team control) and `MEMBER` (view + RSVP)
- **League Level**: `LEAGUE_ADMIN` (full league control), `TEAM_ADMIN` (manage own team), `MEMBER` (basic access)

### Server Actions Pattern

Server Actions are the primary method for data mutations (not API routes). They follow a consistent pattern:

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export async function myAction(input: InputType): Promise<ActionResult<OutputType>> {
  try {
    // 1. Always authenticate first
    const userId = await requireUserId();

    // 2. Validate input with Zod
    const validated = mySchema.parse(input);

    // 3. Check authorization (team admin, etc.)
    await requireTeamAdmin(validated.teamId);

    // 4. Perform database operation
    const result = await prisma.model.create({
      data: validated,
    });

    // 5. Revalidate affected pages
    revalidatePath("/path");

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: "Friendly error message" };
  }
}
```

**Critical Security Rules**:
1. NEVER trust client input - always validate with Zod
2. ALWAYS check authentication first (`requireUserId()`)
3. ALWAYS verify authorization (admin role, team membership)
4. ALWAYS use Prisma (parameterized queries) - NEVER raw SQL
5. ALWAYS sanitize user input displayed in UI
6. NEVER expose sensitive data (emergency contacts to non-admins)

### Data Fetching Strategy

**Default: React Server Components**
```typescript
// app/(dashboard)/roster/page.tsx
export default async function RosterPage({ params }: { params: { teamId: string } }) {
  // Fetch directly in Server Component
  const players = await prisma.player.findMany({
    where: { teamId: params.teamId },
  });

  return <RosterList players={players} />;
}
```

**Only use Client Components when you need**:
- User interactions (forms, buttons)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)
- Optimistic updates (useOptimistic for RSVP buttons)

### Security Implementation

**Comprehensive security measures** (see `docs/SECURITY_IMPLEMENTATION.md` for details):

1. **Authentication**: Auth.js with bcrypt password hashing (cost factor 12)
2. **Authorization**: Role-based access control checked in every Server Action
3. **Input Validation**: Zod schemas on all user inputs (client and server)
4. **SQL Injection Prevention**: Prisma ORM with parameterized queries (no raw SQL)
5. **XSS Prevention**: React's built-in escaping + CSP headers
6. **CSRF Protection**: Auth.js built-in token validation
7. **HTTPS Enforcement**: Middleware redirects HTTP to HTTPS in production
8. **Rate Limiting**: Applied to API routes (auth: 5 req/15min, general: 100 req/15min)
9. **Security Headers**: Configured in `next.config.ts` (HSTS, CSP, X-Frame-Options, etc.)
10. **Password Security**: Minimum length 8 chars, bcrypt hashing
11. **Session Management**: HTTP-only cookies, secure JWT tokens
12. **Data Sanitization**: Input sanitization for user-generated content

**Critical Security Headers** (`next.config.ts`):
- `Strict-Transport-Security`: HTTPS enforcement
- `Content-Security-Policy`: Prevents XSS attacks
- `X-Frame-Options: SAMEORIGIN`: Prevents clickjacking
- `X-Content-Type-Options: nosniff`: MIME type sniffing protection

### Mobile-First Design

**Responsive Breakpoints** (MUI theme):
- `xs`: <600px (mobile)
- `sm`: 600-960px (tablet)
- `md`: >960px (desktop)

**Key Mobile Patterns**:
- Bottom navigation on mobile, sidebar on desktop
- Calendar: grid view on desktop, list view on mobile
- Touch targets: minimum 44x44px
- Forms optimized for mobile input (proper keyboard types)
- Tables convert to card layouts on mobile

### Email Service Architecture

Email service is abstracted (`lib/email/`) for future AWS SES migration:
- Current: Mailchimp Transactional Email
- Future: Easy migration to AWS SES by updating `client.ts`

**Email Templates** (`lib/email/templates.ts`):
- Team invitations with signup links
- Event notifications (created/updated/cancelled)
- RSVP reminders (48 hours before events)
- Welcome emails for new users
- League announcements
- Targeted messages by division/team

**Cron Jobs** (`app/api/cron/`):
- RSVP reminders: Runs hourly, sends reminders 48 hours before events

### Environment Configuration

**Required Environment Variables** (validate with `bun run validate-env`):
```bash
DATABASE_URL           # PostgreSQL connection string (must include ?sslmode=require for Neon)
NEXTAUTH_URL           # Application URL (http://localhost:3000 for dev)
NEXTAUTH_SECRET        # Generate with: openssl rand -base64 32
MAILCHIMP_API_KEY      # Mailchimp Transactional API key
EMAIL_FROM             # Verified sender email address
```

**Optional Variables**:
```bash
NEXT_PUBLIC_UMAMI_WEBSITE_ID  # Umami analytics (privacy-friendly)
AWS_REGION                     # For future AWS migration
```

## Working with the Codebase

### Making Database Changes

**Workflow for schema modifications**:
```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply migration
bun run db:migrate
# 3. Generate updated Prisma Client (updates TypeScript types)
bun run db:generate
# 4. Test changes
bun run dev
```

**Migration commands**:
- Development: `bun run db:migrate` (creates migration files and applies them)
- Production: `bun run db:migrate:deploy` (applies existing migrations, runs in postinstall script)
- Prototyping: `bun run db:push` (skips migration files, direct schema push)

**Important**: Always commit both `schema.prisma` and migration files together.

### Adding New Features

**Standard feature implementation flow**:

1. **Define validation schema** (`lib/utils/validation.ts`):
```typescript
export const myFeatureSchema = z.object({
  field: z.string().min(1, "Required"),
});
export type MyFeatureInput = z.infer<typeof myFeatureSchema>;
```

2. **Create Server Action** (`lib/actions/my-feature.ts`):
```typescript
"use server";
export async function myFeatureAction(input: MyFeatureInput) {
  const userId = await requireUserId();
  const validated = myFeatureSchema.parse(input);
  // ... implementation
}
```

3. **Build UI component** (`components/features/my-feature/`):
```typescript
"use client"; // Only if user interaction needed
export function MyFeatureForm() {
  // Form with client-side validation using Zod schema
}
```

4. **Create page** (`app/(dashboard)/my-feature/page.tsx`):
```typescript
// Server Component for data fetching
export default async function MyFeaturePage() {
  const data = await prisma.model.findMany();
  return <MyFeatureForm data={data} />;
}
```

### Testing Practices

**Test structure**:
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should handle valid input', () => {
    // Test implementation
  });

  it('should reject invalid input', () => {
    // Test validation
  });
});
```

**Key testing areas**:
- Zod validation schemas
- Server Action logic (mock Prisma)
- React components (Testing Library)
- Integration tests for critical flows

### Common Gotchas

1. **Always use Server Actions, not API routes** - API routes only for webhooks/cron
2. **Never forget `"use server"` directive** - Required at top of Server Action files
3. **Never trust client input** - Always validate with Zod on server
4. **Prisma Client must be regenerated** - After schema changes, run `bun run db:generate`
5. **Revalidate paths after mutations** - Use `revalidatePath()` in Server Actions
6. **Emergency contacts are admin-only** - Never expose to regular members
7. **Player vs User distinction** - Player is roster entry, User is authenticated account
8. **League relationships are optional** - Teams can exist standalone (leagueId is nullable)

### Middleware Configuration

**Middleware** (`middleware.ts`) handles:
- HTTPS enforcement in production
- Rate limiting for API routes (auth: 5 req/15min, general: 100 req/15min)
- Security header injection
- Applied to all routes except static files

### Deployment Notes

**Automatic on Vercel** (configured in `vercel.json`):
- Build command: `bun run build`
- Install command: `bun install`
- Database migrations: Run automatically via `postinstall` script
- Environment variables: Must be configured in Vercel dashboard

**Pre-deployment checklist**:
1. All environment variables set in Vercel
2. Database connection tested
3. Email service configured (domain verified)
4. `bun run type-check` passes
5. `bun run lint` passes
6. `bun run test` passes

### CI/CD and Releases

OpenLeague uses semantic versioning with conventional commits:
- `feat:` commits trigger minor version bump (0.X.0)
- `fix:` commits trigger patch version bump (0.0.X)
- `feat!:` or `BREAKING CHANGE:` trigger major version bump (X.0.0)

**Release process**:
1. Merge to `main` branch triggers automated release workflow
2. GitHub Actions runs type-checking, linting, and tests
3. Semantic version determined from commit messages
4. Changelog generated automatically
5. GitHub release created with assets

See `.github/AUTOMATION.md` for full CI/CD details.

### Documentation Resources

**Project Documentation**:
- `README.md` - Comprehensive setup and feature documentation
- `SETUP.md` - Development setup and implementation progress
- `DEPLOYMENT.md` - Detailed deployment guide
- `SECURITY.md` - Security policy and vulnerability reporting
- `docs/SECURITY_IMPLEMENTATION.md` - Security measures and implementation details
- `.github/CONTRIBUTING.md` - Contribution guidelines
- `.github/AUTOMATION.md` - CI/CD and release automation

**External Documentation**:
- Next.js 15: https://nextjs.org/docs
- React 19: https://react.dev
- MUI v7: https://mui.com/material-ui/
- Prisma: https://www.prisma.io/docs
- Auth.js: https://authjs.dev/
- Zod: https://zod.dev/

## License

Business Source License 1.1 (BUSL-1.1) - converts to Apache 2.0 on October 4, 2029. Commercial use as a service to third parties requires a commercial license. Self-hosting for your own organization is freely permitted.
