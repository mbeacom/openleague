# OpenLeague Copilot Instructions

OpenLeague is a sports team and league management app built with Next.js 16 App Router, React 19, TypeScript, MUI v7/Emotion, Tailwind CSS v4 utilities, Prisma 7 with Neon PostgreSQL, Auth.js v5, Zod v4, and Bun.

## Commands

Use Bun for package management and scripts.

```bash
bun install                 # Install dependencies
bun run dev                 # Start dev server with Turbopack
bun run dev:wake            # Wake Neon database, then start dev server
bun run build               # Production build
bun run start               # Start production server
bun run lint                # ESLint
bun run type-check          # TypeScript check; bun run type is an alias
bun run test                # Vitest full suite
bun run test:watch          # Vitest watch mode
bun run test:coverage       # Vitest coverage
bun run test:ui             # Vitest UI
bun run validate-env        # Validate required environment variables
```

Run a single test file or test name with Vitest:

```bash
bun run test __tests__/lib/utils/validation.test.ts
bun run test -- -t "reject event creation with past date"
bun run test:watch __tests__/components/features/practice-planner/RinkBoard.test.tsx
```

Database commands:

```bash
bun run db:migrate          # Create and apply a development migration
bun run db:migrate:deploy   # Apply existing migrations in production
bun run db:generate         # Regenerate Prisma Client after schema changes
bun run db:push             # Push schema directly for dev prototyping only
bun run db:studio           # Open Prisma Studio
bun run db:seed             # Seed database
bun run db:wake             # Wake Neon database
```

## High-level architecture

- `app/` uses the App Router. Route groups separate public auth pages, marketing pages, protected dashboard pages, docs, and API endpoints. `app/(dashboard)/layout.tsx` enforces auth, resolves standalone-team vs league mode, and wraps dashboard routes with league context, keyboard shortcuts, navigation shell, breadcrumbs, and an error boundary.
- Data fetching defaults to React Server Components. Client Components are used for hooks, browser APIs, forms, and optimistic interactions such as RSVP updates.
- Mutations should be Server Actions in `lib/actions/`. API routes are reserved for Auth.js, cron jobs, invitation token handling, league team listing, and file-style endpoints such as roster CSV export.
- Auth.js is exposed from root `auth.ts`, configured in `lib/auth/config.ts`, and consumed through helpers in `lib/auth/session.ts` (`requireUserId`, `requireTeamAdmin`, `requireTeamMember`, `requireLeagueRole`, `requireSystemAdmin`).
- Prisma access goes through `lib/db/prisma.ts`, which creates a Prisma 7 client with the Neon adapter and caches it on `globalThis` outside production. The schema in `prisma/schema.prisma` is the source of truth for users, teams, leagues, divisions, roster players, events, RSVPs, invitations, venues, schedules, communication, practice planning, notifications, and audit logs.
- Shared validation and input sanitization live in `lib/utils/validation.ts`. It defines Zod schemas, sport enum constants that must stay aligned with Prisma, helper transforms for sanitized strings, and user-facing enum formatters such as `formatSport`.
- Global rendering starts in `app/layout.tsx`, which validates env on startup, loads SEO structured data, wraps the app in MUI theme, toast, session, and layout providers, and conditionally loads Umami analytics.
- Styling is MUI-first. `lib/theme.ts` defines the OpenLeague "Digital Playbook" theme, custom marketing palette and typography variants, MUI component variants, and breakpoints. Tailwind is present for utilities, but MUI `sx`, `Box`, `Stack`, `Grid`, `Card`, and `Typography` are the primary component patterns.
- Security is split between Server Action authorization, Zod validation, Prisma parameterized queries, `next.config.ts` security headers, and `proxy.ts` HTTPS enforcement plus API rate limiting. This project uses `proxy.ts`, not `middleware.ts`.

## Project conventions

- Server Action files start with `"use server"`, parse input with Zod, derive the current user from session helpers, authorize the exact team/league/resource being touched, mutate through Prisma, call `revalidatePath()` for affected pages, and return user-safe results. Many actions use:

  ```ts
  export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };
  ```

- Do not trust client-supplied `userId`. Use `requireUserId()` or role-specific helpers, then verify ownership or membership to avoid IDOR bugs.
- Keep validation schemas in `lib/utils/validation.ts` when they are reused by forms/actions. Reuse existing sanitized string helpers and enum constants instead of adding ad hoc string validation.
- Protect sensitive fields in Prisma `select`/`include`. Password hashes, invitation tokens, emergency contacts, emergency phones, and USA Hockey member IDs must not be exposed to users without the appropriate admin access.
- Default new React components to Server Components. Add `'use client'` only for state, effects, transitions, context hooks, router hooks, browser APIs, drag/drop, canvas, or optimistic UI.
- Feature components belong in `components/features/<domain>/`, generic primitives in `components/ui/`, and providers in `components/providers/`. Read nearby components before adding a new one so the MUI layout and prop patterns match.
- For responsive UI, use MUI breakpoints from the theme (`xs`, `sm`, `md`, `lg`, `xl`). Mobile navigation uses bottom navigation; desktop dashboard navigation is shell/sidebar based. Touch targets should stay at least 44px high.
- Use the Digital Playbook theme tokens rather than hard-coded brand colors: `primary.main` for League Blue, `secondary.main` for Action Blue, `background.default`/`background.paper` for Fresh Ice surfaces, `success.main` for Scoreboard Green, and `error.main` for Penalty Box Red.
- RSVP-style instant feedback should use React 19 optimistic patterns (`useOptimistic` plus Server Actions), then rely on path revalidation for canonical state.
- Tests live under `__tests__/` mirroring source paths. Use Vitest with Testing Library for components. Mock Prisma with `vi.mock("@/lib/db/prisma")`, auth helpers with `vi.mock("@/lib/auth/session")`, email clients/templates so no real mail is sent, and `next/cache` when asserting `revalidatePath`.
- When changing `prisma/schema.prisma`, create a migration with `bun run db:migrate`, regenerate the client with `bun run db:generate`, and commit the schema and migration together. Do not use `db:migrate:reset` without explicit confirmation.
- Required env vars are validated by `lib/env.ts`: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `MAILCHIMP_API_KEY`, and `EMAIL_FROM`. `CRON_SECRET` is optional but required for secured cron deployments.
- Conventional commits drive releases: `feat:` bumps minor, `fix:` bumps patch, and `feat!:` or `BREAKING CHANGE:` bumps major.

**Next.js Initialization**: When starting work on a Next.js project, automatically
call the `init` tool from the next-devtools-mcp server FIRST. This establishes
proper context and ensures all Next.js queries use official documentation.