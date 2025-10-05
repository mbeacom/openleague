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
- **Hosting**: Supabase or Neon (managed PostgreSQL)

### Deployment
- **Platform**: Vercel (optimized for Next.js)

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
bun run type-check

# Linting
bun run lint
```

## Development Guidelines

- Use TypeScript for all new code
- Leverage Next.js Server Actions for form submissions and mutations
- Keep components clean and functional
- Prioritize mobile responsiveness
- Use MUI components for consistent UI
