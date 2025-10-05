# OpenLeague - AI Coding Agent Instructions

## Project Overview

OpenLeague is a free sports team management platform in **pre-implementation MVP stage**. The codebase currently contains only planning documents (`.kiro/` directory) with no application code yet. The MVP replaces chaotic spreadsheets and group chats with a single source of truth for team managers.

**Critical**: This is a greenfield project. The Next.js app structure doesn't exist yet - it needs initialization.

## Architecture & Stack

### Core Technologies
- **Runtime**: Node.js 22+, Bun (package manager - `bun install`, `bun run`)
- **Framework**: Next.js 14+ with App Router (not Pages Router)
- **Language**: TypeScript (required for all code)
- **UI**: MUI v7+ with Emotion styling
- **Database**: Neon (serverless PostgreSQL) via Prisma ORM (may migrate to AWS RDS in future)
- **Auth**: Auth.js (NextAuth.js) with credentials provider
- **Email**: Mailchimp Transactional Email (may migrate to AWS SES in future)
- **Deployment**: Vercel

### Data Fetching Philosophy
**React Server Components First**: Use RSC for data fetching by default. Only use TanStack Query for Client Components requiring:
- Real-time optimistic updates (e.g., RSVP buttons)
- Client-side caching with complex invalidation
- Background polling/refetching

Most pages should fetch in Server Components and pass props to Client Components.

### Project Structure (When Initialized)
```
app/
├── (auth)/           # Login/signup routes
├── (dashboard)/      # Protected routes (roster, calendar, events)
├── api/              # API routes (primarily for Auth.js)
└── layout.tsx        # Root layout with MUI ThemeProvider

components/
├── ui/               # Base components (Button, Input, Card, Dialog)
└── features/         # Feature-specific (roster/, calendar/, events/)

lib/
├── actions/          # Server Actions (team.ts, roster.ts, events.ts, rsvp.ts)
├── auth/             # Auth.js config and session helpers
├── db/               # Prisma client singleton
├── email/            # Email templates and client
└── utils/            # Validation (Zod), date helpers

prisma/
└── schema.prisma     # Database schema (User, Team, TeamMember, Player, Event, RSVP, Invitation)
```

## Key Patterns & Conventions

### Server Actions Over API Routes
Use Server Actions (not API routes) for mutations and form submissions:
```typescript
// lib/actions/team.ts
'use server'

export async function createTeam(data: CreateTeamInput) {
  const session = await requireAuth(); // Always validate auth first
  if (!session.user?.id) throw new Error('Unauthorized'); // Defensive check
  const validated = teamSchema.parse(data); // Zod validation

  return await prisma.team.create({
    data: { ...validated, members: { create: { userId: session.user.id, role: 'ADMIN' } } }
  });
}
```

### Authentication Pattern
Every protected Server Action must start with:
```typescript
const session = await requireAuth(); // Throws if not authenticated
if (!session.user.id) throw new Error('Unauthorized');
```

### Role-Based Access
Two roles only: `ADMIN` (full access) and `MEMBER` (view + RSVP). Check role before mutations:
```typescript
const member = await prisma.teamMember.findFirst({
  where: { userId: session.user.id, teamId, role: 'ADMIN' }
});
if (!member) throw new Error('Admin access required');
```

### Optimistic Updates (Sparingly)
Use `useOptimistic` hook for instant UI feedback on RSVP buttons:
```typescript
const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus);

async function handleRSVP(status: RSVPStatus) {
  setOptimisticStatus(status);
  await updateRSVP(eventId, status);
}
```

### Mobile-First Responsive Design
- Minimum 44x44px touch targets
- MUI breakpoints: `xs` (<600px), `sm` (600-960px), `md` (>960px)
- Bottom navigation on mobile, sidebar on desktop
- Calendar: grid on desktop, list on mobile

### Validation with Zod
Define schemas in `lib/utils/validation.ts`, use in both client forms and Server Actions:
```typescript
export const eventSchema = z.object({
  type: z.enum(['GAME', 'PRACTICE']),
  date: z.date().min(new Date(), 'Date cannot be in the past'),
  opponent: z.string().optional().refine((val, ctx) =>
    ctx.parent.type === 'GAME' ? !!val : true, 'Opponent required for games'
  ),
});
```

## Theming & Branding

### MVP Theme
- **Primary Color**: Deep Blue (#1976D2 - Material Blue 700)
- **Secondary Color**: Vibrant Green (#43A047 - Material Green 600)
- **Typography**: Roboto (MUI default)
- **Accessibility**: All colors meet WCAG AA contrast standards
- **Mobile-first**: Responsive breakpoints (xs: <600px, sm: 600-960px, md: >960px)

### Future Customization (Post-MVP)
- **Per-Organization Theming**: Each league/org/team can customize colors, logo, layout
- **Logo-Based Color Extraction**: Auto-generate theme from uploaded logo
- **Layout Customization**: Allow reordering/hiding page sections (inspired by Crossbar competitor)
- **Component Placement**: Drag-and-drop page builder for team pages

For MVP, focus on clean, professional defaults. Theming infrastructure can be designed with future extensibility in mind.

## MVP Scope Guardrails

### In Scope
- Single team management (one team per session)
- Two roles: Admin and Member
- Event types: Game and Practice only
- RSVP: Going/Not Going/Maybe
- Email notifications (invites, event updates)

### Explicitly Out of Scope (Reject Features)
- ❌ Payments/registration systems
- ❌ Multi-team/league views
- ❌ Stats tracking (goals, assists)
- ❌ Public websites
- ❌ In-app chat/messaging
- ❌ Advanced calendar features (recurring events, iCal sync)

## Development Workflow

### Initial Setup (Not Yet Done)
```bash
bunx create-next-app@latest openleague --typescript --app --no-tailwind
cd openleague
bun install @mui/material @emotion/react @emotion/styled @prisma/client prisma next-auth@beta @auth/prisma-adapter bcrypt zod @mailchimp/mailchimp_transactional
bunx prisma init
# Configure DATABASE_URL (Neon) and other env vars in .env.local
bunx prisma migrate dev --name init
```

### Environment Variables
Create `.env.local` with required variables:
```bash
# Database (Neon)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Email Service (Mailchimp Transactional)
MAILCHIMP_API_KEY="your-mailchimp-transactional-api-key"
EMAIL_FROM="noreply@openleague.app"

# Optional: For future AWS migration
# AWS_REGION="us-east-1"
# AWS_ACCESS_KEY_ID="your-access-key"
# AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### Common Commands
```bash
bun install              # Install dependencies
bun run dev              # Start dev server (port 3000)
bun run build            # Production build
bun run type             # TypeScript type checking
bun run lint             # Run ESLint
bun run test             # Run tests with vitest
bun run test:watch       # Run tests in watch mode
bun run test:coverage    # Generate coverage report
bunx prisma studio       # Visual database browser
bunx prisma migrate dev  # Create and apply migration
```

### Testing & Quality Assurance
- **Unit/Integration Tests**: Vitest (configured in package.json)
- **Type Safety**: Run `bun run type` before committing
- **Linting**: Run `bun run lint` to check code style
- **Manual Testing**: Use mobile viewport in browser DevTools
- **Database Inspection**: Use `prisma studio` to verify data state
- **Pre-commit Checklist**: Ensure types pass, linting passes, tests pass

## Key Reference Files

**Planning Docs** (current state):
- `.kiro/steering/product.md` - MVP scope and principles
- `.kiro/steering/tech.md` - Stack decisions and commands
- `.kiro/specs/team-management-mvp/design.md` - Architecture and data models
- `.kiro/specs/team-management-mvp/requirements.md` - Acceptance criteria
- `.kiro/specs/team-management-mvp/tasks.md` - Step-by-step implementation plan

**To Be Created**:
- `lib/auth/session.ts` - `getSession()` and `requireAuth()` helpers
- `lib/db/prisma.ts` - Singleton Prisma client
- `prisma/schema.prisma` - Complete schema (see design.md for models)

## Common Pitfalls to Avoid

1. **Don't use Pages Router** - Use App Router exclusively (`app/` directory)
2. **Don't overuse TanStack Query** - Default to Server Components for data fetching
3. **Don't use Tailwind** - MUI with Emotion is the styling approach
4. **Don't forget auth checks** - Every Server Action must validate session
5. **Don't allow scope creep** - Reject features not in MVP scope
6. **Don't use npm or yarn** - Use Bun for all package management and script execution (`bun` not `npm`/`yarn`)
7. **Don't expose emergency contacts to members** - Admin-only field

## Priority Order for Implementation

Follow the task list in `.kiro/specs/team-management-mvp/tasks.md` sequentially:
1. Initialize Next.js + install dependencies
2. Setup Prisma + PostgreSQL database
3. Implement Auth.js authentication
4. Create MUI theme + base components
5. Team creation + dashboard
6. Roster management
7. Invitation system
8. Event scheduling
9. Calendar views
10. RSVP system

## Questions for Clarification

When uncertain about:
- **Feature scope**: Check if it's in MVP scope (product.md)
- **Technical approach**: Refer to tech.md and design.md
- **Database schema**: See schema in design.md lines 188-300
- **UI patterns**: Follow MUI best practices, mobile-first
