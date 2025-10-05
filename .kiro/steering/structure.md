---
inclusion: always
---

# Project Structure

## Current Organization

```
openleague/
├── .git/                 # Git version control
├── .kiro/               # Kiro AI assistant configuration
│   └── steering/        # AI steering rules
├── node_modules/        # Dependencies (managed by Bun)
├── .gitignore          # Git ignore patterns
├── bun.lockb           # Bun lockfile
├── package.json        # Project dependencies and scripts
└── README.md           # Project documentation
```

## Expected Next.js Structure

When the Next.js application is initialized, the structure should follow:

```
openleague/
├── app/                 # Next.js App Router
│   ├── (auth)/         # Auth-related routes
│   ├── (dashboard)/    # Protected dashboard routes
│   ├── api/            # API routes
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/          # Reusable React components
│   ├── ui/             # Base UI components (buttons, inputs, etc.)
│   └── features/       # Feature-specific components
├── lib/                # Utility functions and configurations
│   ├── db/             # Database client and Prisma schema
│   ├── auth/           # Auth.js configuration
│   └── utils/          # Helper functions
├── public/             # Static assets
├── types/              # TypeScript type definitions
└── prisma/             # Prisma schema and migrations
    └── schema.prisma
```

## Conventions

- Use the App Router (not Pages Router)
- Group related routes with parentheses for organization without affecting URLs
- Keep components modular and feature-focused
- Store shared utilities in `lib/`
- Use Prisma for all database interactions
- Environment variables in `.env.local` (never commit)
