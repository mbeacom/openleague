# OpenLeague

A free, open-source platform for managing sports teams. Simplify your season with tools for roster management, scheduling, and team communication.

## Project Status

🚧 **Pre-MVP Development** - Currently in initial setup phase.

See [SETUP.md](./SETUP.md) for detailed setup progress and [.kiro/specs/team-management-mvp/](./kiro/specs/team-management-mvp/) for implementation plan.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **UI**: MUI v7 with Emotion styling
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Auth**: Auth.js (NextAuth.js) v5
- **Email**: Mailchimp Transactional Email
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 22+
- Bun (package manager)
- PostgreSQL database (Neon recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/mbeacom/openleague.git
cd openleague

# Install dependencies
bun install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your configuration
# - DATABASE_URL: Your Neon PostgreSQL connection string
# - NEXTAUTH_SECRET: Generate with: openssl rand -base64 32
# - MAILCHIMP_API_KEY: Your Mailchimp Transactional API key
```

### Development

```bash
# Run development server with Turbopack
bun run dev

# Open http://localhost:3000
```

### Available Scripts

```bash
bun run dev          # Start development server
bun run build        # Build for production
bun run start        # Start production server
bun run lint         # Run ESLint
bun run type-check   # TypeScript type checking

# Database commands (after Prisma setup)
bun run db:studio    # Open Prisma Studio
bun run db:push      # Push schema to database
bun run db:migrate   # Create and run migrations
bun run db:generate  # Generate Prisma Client
```

## MVP Features

- **User Authentication**: Email/password signup and login
- **Team Management**: Create and manage a single team
- **Roster Management**: Add players with contact information
- **Invitation System**: Email invitations to join team
- **Event Scheduling**: Create games and practices
- **Calendar View**: Responsive calendar (grid on desktop, list on mobile)
- **RSVP System**: Members respond Going/Not Going/Maybe
- **Attendance Tracking**: Admins view attendance summaries

## Project Structure

```plaintext
app/                 # Next.js App Router
├── (auth)/         # Authentication routes
├── (dashboard)/    # Protected dashboard routes
└── api/            # API routes (primarily Auth.js)

components/
├── ui/             # Base UI components
└── features/       # Feature-specific components

lib/
├── actions/        # Server Actions
├── auth/           # Auth.js configuration
├── db/             # Prisma client
├── email/          # Email templates and client
└── utils/          # Validation and utilities

prisma/
└── schema.prisma   # Database schema
```

## Contributing

This is currently a personal project in early development. Contributions will be welcome once the MVP is complete.

## License

Business Source License 1.1 - see [LICENSE](./LICENSE) file for details.

## Links

- [Planning Documents](./.kiro/specs/team-management-mvp/)
- [Setup Progress](./SETUP.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [MUI Documentation](https://mui.com/material-ui/)
- [Prisma Documentation](https://www.prisma.io/docs)
