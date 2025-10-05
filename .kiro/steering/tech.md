---
inclusion: always
---

# Tech Stack

## Core Technologies

- **Runtime**: Node.js 22+, Bun (package manager)
- **Framework**: Next.js 14+ with React 19
- **Language**: TypeScript (required for type safety)
- **UI Library**: MUI (Material-UI) v7+
- **Styling**: Emotion (via @emotion/react and @emotion/styled)

## Recommended Architecture

### Frontend
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Next.js App Router
- **Data Mutations**: Next.js Server Actions

### Backend
- **API**: Next.js API Routes / Server Actions (keep backend and frontend in same project)
- **Authentication**: Auth.js (NextAuth.js)
- **ORM**: Prisma with TypeScript type generation

### Database
- **Database**: PostgreSQL
- **Hosting**: Neon (serverless PostgreSQL, may migrate to AWS RDS in future)

### Deployment
- **Platform**: Vercel (optimized for Next.js)

### Email
- **Service**: Mailchimp Transactional Email (may migrate to AWS SES in future)
- **Use Cases**: Invitations, event notifications, RSVP reminders

## Common Commands

```bash
# Install dependencies
bun install

# Development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Type checking
bun run type

# Linting
bun run lint

# Testing
bun run test              # Run tests with vitest
bun run test:watch        # Run tests in watch mode
bun run test:coverage     # Generate coverage report

# Database
bunx prisma studio        # Visual database browser
bunx prisma migrate dev   # Create and apply migration
```

## Development Guidelines

- Use TypeScript for all new code
- Leverage Next.js Server Actions for form submissions and mutations
- Keep components clean and functional
- Prioritize mobile responsiveness
- Use MUI components for consistent UI
- Ensure types pass, linting passes, and tests pass before committing
