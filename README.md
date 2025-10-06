# OpenLeague
[![Release](https://github.com/mbeacom/openleague/workflows/Release/badge.svg)](https://github.com/mbeacom/openleague/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/github/package-json/v/mbeacom/openleague)](./package.json)

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

## CI/CD & Releases

OpenLeague uses GitHub Actions for automated releases:

- **Automatic Releases**: Push to `main` triggers semantic versioning and GitHub releases
- **Version Management**: Based on conventional commit messages
- **Quality Checks**: Automated type-checking, linting, and builds
- **Changelog Generation**: Automatic categorized changelog from commits

See [.github/AUTOMATION.md](./.github/AUTOMATION.md) for details.

### Quick Release Guide

```bash
# Commits determine version bump:
git commit -m "feat: new feature"  # Minor bump (0.X.0)
git commit -m "fix: bug fix"       # Patch bump (0.0.X)
git commit -m "feat!: breaking"    # Major bump (X.0.0)

# Just merge to main - automation handles the rest!
git push origin main
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for:

- Development setup
- Coding conventions
- Commit message format
- PR process
- Release workflow

This project follows [Conventional Commits](https://www.conventionalcommits.org/) and [Semantic Versioning](https://semver.org/).

## License & Usage

### Business Source License 1.1

OpenLeague is licensed under the **Business Source License 1.1** - see [LICENSE](./LICENSE) for full details.

#### What This Means

**✅ You CAN (No License Needed):**

- Use OpenLeague for your league/organization's internal management
- Self-host on your own infrastructure for your own use
- Fork, modify, and customize for your organization
- Share improvements back to the community
- Study the code and learn from it

**⚠️ You Need a Commercial License To:**

- Offer OpenLeague as a SaaS to multiple third-party organizations
- Sell OpenLeague-based hosting services commercially
- Build a competing business using OpenLeague code
- Provide OpenLeague as a managed service for profit

**🔄 Future License Change:**

- On **October 4, 2029**, this license automatically converts to **Apache 2.0**
- After that date, all usage restrictions are removed
- This ensures long-term openness while protecting early development

### Deployment Options

#### 1. **Hosted Service (Recommended for Most Users)**

Coming soon - we'll offer a professionally hosted version at [openl.app](https://openl.app) with:

- Zero setup or maintenance
- Automatic updates and backups
- Professional support
- Free tier for small teams

📚 **Developer Documentation:** [openleague.dev](https://openleague.dev)

#### 2. **Self-Hosting (For Technical Teams)**

Self-hosting is fully supported and encouraged for your own organization:

```bash
# Clone and deploy
git clone https://github.com/mbeacom/openleague.git
cd openleague
bun install
# Configure .env.local with your services
bun run build
bun run start
```

**Requirements for self-hosting:**

- PostgreSQL database (Neon, Supabase, or self-hosted)
- SMTP service for emails (Mailchimp Transactional, AWS SES, etc.)
- Node.js 22+ hosting environment (Vercel, AWS, etc.)

See [SETUP.md](./SETUP.md) for detailed deployment instructions.

**Self-hosting is perfect for:**

- Tech-savvy leagues who want full control
- Organizations with existing infrastructure
- Teams requiring custom modifications
- Development and testing environments

### Commercial Licensing

Interested in offering OpenLeague as a commercial service to multiple organizations?

We offer commercial licenses that allow you to:

- Build and sell OpenLeague-based SaaS products
- Offer managed hosting services commercially
- White-label OpenLeague for your customers
- Receive priority support and partnership opportunities

**Contact:** [mark@openl.app](mailto:mark@openl.app) for commercial licensing inquiries.

## Documentation

### Project Documentation

- [Planning Documents](./.kiro/specs/team-management-mvp/)
- [Setup Progress](./SETUP.md)
- [Contributing Guide](./.github/CONTRIBUTING.md)
- [Release Process](./.github/RELEASE_TEMPLATE.md)
- [CI/CD Automation](./.github/AUTOMATION.md)

### External Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [MUI Documentation](https://mui.com/material-ui/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
