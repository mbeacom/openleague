# OpenLeague
[![Release](https://github.com/mbeacom/openleague/workflows/Release/badge.svg)](https://github.com/mbeacom/openleague/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/github/package-json/v/mbeacom/openleague)](./package.json)

A free, open-source platform for managing sports teams. Simplify your season with tools for roster management, scheduling, and team communication.

## Project Status

✅ **MVP Complete** - Ready for production use with core team management features.

The MVP includes user authentication, team creation, roster management with email invitations, event scheduling, calendar views, and RSVP tracking. See [implementation plan](./.kiro/specs/team-management-mvp/) for detailed feature documentation.

## Tech Stack

- **Framework**: Next.js 15 with App Router and React 19
- **Language**: TypeScript (required for type safety)
- **UI**: MUI v7 with Emotion styling
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Auth**: Auth.js (NextAuth.js) v5 with credentials provider
- **Email**: Mailchimp Transactional Email (future: AWS SES migration)
- **Deployment**: Vercel with automatic migrations
- **Package Manager**: Bun (faster than npm/yarn)

## Getting Started

### Prerequisites

- **Node.js 22+** - Required for Next.js 15 and React 19
- **Bun** - Package manager (faster than npm/yarn)
- **PostgreSQL Database** - Neon recommended for serverless PostgreSQL
- **Email Service** - Mailchimp Transactional Email account

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/mbeacom/openleague.git
cd openleague

# 2. Install dependencies
bun install

# 3. Copy environment template
cp .env.example .env.local

# 4. Configure environment variables (see Environment Variables section below)
# Edit .env.local with your database and email service credentials

# 5. Validate environment configuration
bun run validate-env

# 6. Set up database
bun run db:migrate

# 7. Start development server
bun run dev

# 8. Open http://localhost:3000
```

### Environment Variables

Create a `.env.local` file with the following required variables:

```bash
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"

# Auth.js Configuration
NEXTAUTH_URL="http://localhost:3000"  # Use your domain in production
NEXTAUTH_SECRET=""  # Generate with: openssl rand -base64 32

# Email Service (Mailchimp Transactional)
MAILCHIMP_API_KEY=""  # Get from Mailchimp Transactional dashboard
EMAIL_FROM="noreply@yourdomain.com"  # Your sender email address

# Optional: For future AWS migration
AWS_REGION="us-east-1"
```

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string with SSL
- `NEXTAUTH_URL` - Your application URL (localhost for dev, your domain for production)
- `NEXTAUTH_SECRET` - Random 32+ character secret for JWT signing
- `MAILCHIMP_API_KEY` - API key for sending emails
- `EMAIL_FROM` - Verified sender email address

## Development Workflow

### Available Scripts

```bash
# Development
bun run dev          # Start development server with Turbopack
bun run build        # Build for production
bun run start        # Start production server
bun run lint         # Run ESLint
bun run type-check   # TypeScript type checking

# Database Management
bun run db:studio           # Open Prisma Studio (visual database browser)
bun run db:push             # Push schema to database (dev only)
bun run db:migrate          # Create and run migrations (development)
bun run db:migrate:deploy   # Deploy migrations (production)
bun run db:migrate:reset    # Reset database and run all migrations
bun run db:generate         # Generate Prisma Client
bun run db:seed             # Run seed script (optional)

# Utilities
bun run validate-env        # Validate environment variables
```

### Development Process

1. **Make Schema Changes**: Edit `prisma/schema.prisma`
2. **Create Migration**: `bun run db:migrate` (creates migration file and applies it)
3. **Generate Client**: `bun run db:generate` (updates TypeScript types)
4. **Test Changes**: `bun run dev` and test your changes
5. **Commit**: Commit both schema and migration files

## Features

### Core MVP Features ✅

- **User Authentication**: Secure email/password signup and login with Auth.js
- **Team Management**: Create and manage teams with Admin/Member roles
- **Roster Management**: Add players with contact information and emergency contacts
- **Email Invitations**: Send team invitations with unique signup links
- **Event Scheduling**: Create games and practices with date, time, location, and opponent
- **Responsive Calendar**: Grid view on desktop, list view on mobile
- **RSVP System**: Members respond Going/Not Going/Maybe with instant updates
- **Attendance Tracking**: Admins view attendance summaries and member responses
- **Email Notifications**: Automatic emails for events, invitations, and RSVP reminders
- **Mobile-First Design**: Optimized for mobile with touch-friendly interface

### Security & Performance

- **HTTPS Enforced**: Secure headers and SSL/TLS encryption
- **Input Validation**: Zod schemas for all forms and API inputs
- **SQL Injection Prevention**: Parameterized queries via Prisma ORM
- **Session Management**: Secure JWT tokens with HTTP-only cookies
- **Password Security**: bcrypt hashing with cost factor 12
- **Authorization**: Role-based access control (Admin/Member permissions)

## Database Migration Workflow

### Development Workflow

```bash
# 1. Make changes to prisma/schema.prisma
# 2. Create and apply migration
bun run db:migrate

# 3. Generate updated Prisma Client
bun run db:generate

# 4. Test your changes
bun run dev
```

### Production Deployment

Migrations are automatically applied during deployment via the `postinstall` script:

```bash
# This runs automatically on Vercel deployment
prisma generate && prisma migrate deploy
```

### Migration Commands

```bash
# Development - creates migration files and applies them
bun run db:migrate

# Production - applies existing migrations only
bun run db:migrate:deploy

# Reset database (destructive - dev only)
bun run db:migrate:reset

# View database in browser
bun run db:studio
```

## Service Setup

### Database Setup (Neon PostgreSQL)

**Why Neon?** Serverless PostgreSQL with database branching, generous free tier, and optimized for Vercel deployments.

1. **Create Account**: Sign up at [console.neon.tech](https://console.neon.tech)
2. **Create Database**: 
   - Click "Create Project"
   - Choose a name (e.g., "openleague-prod")
   - Select region closest to your users
   - Choose PostgreSQL version (latest recommended)
3. **Get Connection String**:
   - Go to your project dashboard
   - Click "Connection Details"
   - Copy the connection string
   - **Important**: Add `?sslmode=require` to the end
4. **Set Environment Variable**:
   ```bash
   DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"
   ```
5. **Initialize Database**:
   ```bash
   bun run db:migrate  # Creates tables and applies migrations
   ```

**Database Branching (Optional):**
- Create separate branches for development/staging
- Each branch gets its own connection string
- Perfect for testing schema changes safely

**Future Migration Path:** The application is designed to easily migrate to AWS RDS when you need more advanced features or want to consolidate AWS services.

### Email Setup (Mailchimp Transactional)

**Why Mailchimp Transactional?** Reliable delivery, good free tier, and simple API for transactional emails.

1. **Create Account**: 
   - Sign up at [mailchimp.com](https://mailchimp.com)
   - Navigate to Transactional Email (formerly Mandrill)
   - Or directly at [mandrillapp.com](https://mandrillapp.com)

2. **Get API Key**:
   - Go to Settings → SMTP & API Info
   - Create a new API key
   - Copy the key (starts with `md-`)

3. **Verify Sender Domain** (Recommended):
   - Go to Settings → Sending Domains
   - Add your domain (e.g., `yourdomain.com`)
   - Follow DNS verification steps
   - This improves deliverability

4. **Set Environment Variables**:
   ```bash
   MAILCHIMP_API_KEY="md-your-api-key-here"
   EMAIL_FROM="noreply@yourdomain.com"  # Must be verified domain
   ```

5. **Test Email Setup**:
   ```bash
   bun run validate-env  # Validates API key format
   # Then test by creating a team and sending an invitation
   ```

**Email Templates Included:**
- Team invitations with signup links
- Event notifications (created/updated/cancelled)
- RSVP reminders (48 hours before events)
- Welcome emails for new users

**Future Migration Path:** The email service is abstracted and can easily migrate to AWS SES when you need higher volume or want to consolidate AWS services.

## Project Structure

```plaintext
openleague/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Authentication routes (grouped)
│   │   ├── login/page.tsx       # Login page
│   │   └── signup/page.tsx      # Signup page
│   ├── (dashboard)/             # Protected dashboard routes
│   │   ├── layout.tsx           # Dashboard layout with navigation
│   │   ├── page.tsx             # Team dashboard
│   │   ├── roster/page.tsx      # Roster management
│   │   ├── calendar/page.tsx    # Calendar view
│   │   └── events/              # Event management
│   │       ├── [id]/page.tsx    # Event details
│   │       └── new/page.tsx     # Create event
│   ├── api/                     # API routes
│   │   ├── auth/[...nextauth]/  # Auth.js endpoints
│   │   ├── invitations/[token]/ # Invitation acceptance
│   │   └── cron/                # Scheduled jobs (RSVP reminders)
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   └── globals.css              # Global styles
│
├── components/                   # React components
│   ├── ui/                      # Base UI components
│   │   ├── Button.tsx           # MUI Button wrapper
│   │   ├── Input.tsx            # MUI TextField wrapper
│   │   ├── Card.tsx             # MUI Card wrapper
│   │   └── Dialog.tsx           # MUI Dialog wrapper
│   ├── features/                # Feature-specific components
│   │   ├── auth/                # Authentication components
│   │   ├── roster/              # Roster management
│   │   ├── calendar/            # Calendar and events
│   │   ├── events/              # Event forms and details
│   │   └── dashboard/           # Dashboard navigation
│   └── providers/               # Context providers
│       ├── SessionProvider.tsx  # Auth session provider
│       └── ThemeProvider.tsx    # MUI theme provider
│
├── lib/                         # Utility functions and configurations
│   ├── actions/                 # Next.js Server Actions
│   │   ├── auth.ts              # Authentication actions
│   │   ├── team.ts              # Team management
│   │   ├── roster.ts            # Roster operations
│   │   ├── events.ts            # Event CRUD
│   │   ├── rsvp.ts              # RSVP operations
│   │   └── invitations.ts       # Invitation system
│   ├── auth/                    # Authentication configuration
│   │   ├── config.ts            # Auth.js configuration
│   │   └── session.ts           # Session helpers
│   ├── db/                      # Database client
│   │   └── prisma.ts            # Prisma client singleton
│   ├── email/                   # Email service
│   │   ├── client.ts            # Mailchimp client
│   │   └── templates.ts         # Email templates
│   ├── utils/                   # Utility functions
│   │   ├── validation.ts        # Zod schemas
│   │   ├── date.ts              # Date formatting
│   │   └── error-handling.ts    # Error utilities
│   ├── config/                  # Configuration
│   │   └── constants.ts         # App constants
│   ├── env.ts                   # Environment validation
│   └── theme.ts                 # MUI theme configuration
│
├── prisma/                      # Database schema and migrations
│   ├── schema.prisma            # Database schema
│   ├── migrations/              # Migration history
│   │   └── [timestamp]_[name]/  # Individual migrations
│   └── seed.ts                  # Optional seed script
│
├── types/                       # TypeScript type definitions
│   ├── auth.ts                  # Authentication types
│   ├── events.ts                # Event types
│   ├── roster.ts                # Roster types
│   └── invitations.ts           # Invitation types
│
├── public/                      # Static assets
│   └── images/                  # Image assets
│
├── scripts/                     # Utility scripts
│   └── validate-env.js          # Environment validation script
│
├── .env.example                 # Environment variable template
├── .env.local                   # Local environment (not committed)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── next.config.ts               # Next.js configuration
├── vercel.json                  # Vercel deployment configuration
└── README.md                    # This file
```

### Key Architecture Decisions

- **App Router**: Uses Next.js 15 App Router for better performance and developer experience
- **Server Actions**: Primary method for mutations, reducing API route complexity
- **Server Components**: Default for data fetching, Client Components only when needed
- **Prisma ORM**: Type-safe database operations with automatic migrations
- **MUI v7**: Consistent, accessible UI components with custom theming
- **Mobile-First**: Responsive design optimized for mobile devices

## Deployment

### Vercel Deployment (Recommended)

**Why Vercel?** Optimized for Next.js with automatic builds, edge functions, and seamless integration.

#### 1. Prepare Your Repository

```bash
# Ensure your code is committed and pushed to GitHub
git add .
git commit -m "feat: ready for deployment"
git push origin main
```

#### 2. Deploy to Vercel

**Option A: Vercel CLI (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from your project directory
vercel

# Follow the prompts:
# - Link to existing project or create new
# - Set up environment variables
# - Deploy
```

**Option B: Vercel Dashboard**
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Configure environment variables (see below)
5. Click "Deploy"

#### 3. Configure Environment Variables

In Vercel dashboard or CLI, set these environment variables:

```bash
# Database (Production)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"

# Auth.js (Production)
NEXTAUTH_URL="https://your-app.vercel.app"  # Your actual domain
NEXTAUTH_SECRET="your-32-character-secret"   # Same as development or generate new

# Email Service
MAILCHIMP_API_KEY="md-your-api-key"
EMAIL_FROM="noreply@yourdomain.com"

# Optional
AWS_REGION="us-east-1"
```

#### 4. Database Migration

Migrations run automatically on deployment via the `postinstall` script in `package.json`:

```json
{
  "scripts": {
    "postinstall": "prisma generate && prisma migrate deploy"
  }
}
```

This ensures your production database is always up-to-date with your schema.

#### 5. Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Click "Domains" tab
3. Add your custom domain
4. Follow DNS configuration instructions
5. Update `NEXTAUTH_URL` environment variable to your custom domain

### Alternative Deployment Options

#### Docker Deployment

```dockerfile
# Dockerfile (create this file)
FROM node:22-alpine

WORKDIR /app

# Install Bun
RUN npm install -g bun

# Copy package files
COPY package.json bun.lockb ./
RUN bun install

# Copy source code
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build application
RUN bun run build

EXPOSE 3000

# Start application
CMD ["bun", "run", "start"]
```

```bash
# Build and run
docker build -t openleague .
docker run -p 3000:3000 --env-file .env.local openleague
```

#### AWS/DigitalOcean/Railway

1. **Build the application**: `bun run build`
2. **Set environment variables** on your platform
3. **Run migrations**: `bunx prisma migrate deploy`
4. **Start the server**: `bun run start`

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Email service configured and tested
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Database migrations applied
- [ ] Application accessible and functional

### Monitoring & Maintenance

**Built-in Monitoring:**
- Vercel Analytics (performance metrics)
- Vercel Logs (application logs)
- Neon Dashboard (database metrics)
- Mailchimp Reports (email delivery)

**Recommended Additions:**
- Error tracking (Sentry)
- Uptime monitoring (UptimeRobot)
- Performance monitoring (Vercel Speed Insights)

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

## Troubleshooting

### Common Issues

#### Environment Variables

**Error: "Environment variable validation failed"**
```bash
# Check your .env.local file exists and has all required variables
bun run validate-env

# Generate a new NEXTAUTH_SECRET
openssl rand -base64 32

# Ensure DATABASE_URL includes ?sslmode=require for Neon
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
```

#### Database Issues

**Error: "Can't reach database server"**
```bash
# Test database connection
bunx prisma db pull

# Check if DATABASE_URL is correct
echo $DATABASE_URL

# Ensure Neon database is running (check Neon dashboard)
```

**Error: "Migration failed"**
```bash
# Reset database (development only - destructive!)
bun run db:migrate:reset

# Or create a new migration
bun run db:migrate

# Check migration status
bunx prisma migrate status
```

#### Email Issues

**Error: "Email sending failed"**
```bash
# Verify Mailchimp API key is correct
# Check Mailchimp dashboard for API key status

# Ensure EMAIL_FROM domain is verified in Mailchimp
# Test with a simple email first
```

#### Build Issues

**Error: "Type errors during build"**
```bash
# Run type checking locally
bun run type-check

# Regenerate Prisma client
bun run db:generate

# Clear Next.js cache
rm -rf .next
bun run build
```

#### Deployment Issues

**Error: "Deployment failed on Vercel"**
```bash
# Check Vercel logs for specific error
# Ensure all environment variables are set in Vercel dashboard
# Verify DATABASE_URL is accessible from Vercel

# Test build locally
bun run build
bun run start
```

### Performance Issues

**Slow page loads:**
- Check database query performance in Neon dashboard
- Verify images are optimized
- Check Vercel Analytics for bottlenecks

**Email delivery issues:**
- Check Mailchimp delivery reports
- Verify sender domain reputation
- Ensure EMAIL_FROM domain is properly configured

### Getting Help

1. **Check the logs**: Vercel dashboard → Functions → View logs
2. **Database issues**: Neon dashboard → Monitoring
3. **Email issues**: Mailchimp dashboard → Reports
4. **GitHub Issues**: [Create an issue](https://github.com/mbeacom/openleague/issues) with:
   - Error message
   - Steps to reproduce
   - Environment details (Node version, OS, etc.)

## Future Migration Paths

### Database Migration (Neon → AWS RDS)

When you need more advanced database features or want to consolidate AWS services:

1. **Export data** from Neon using `pg_dump`
2. **Create AWS RDS PostgreSQL instance**
3. **Import data** using `pg_restore`
4. **Update DATABASE_URL** environment variable
5. **Test thoroughly** before switching production traffic

The application code requires no changes - only the connection string changes.

### Email Migration (Mailchimp → AWS SES)

When you need higher email volume or AWS consolidation:

1. **Set up AWS SES** and verify domains
2. **Update email client** in `lib/email/client.ts`
3. **Replace MAILCHIMP_API_KEY** with AWS credentials
4. **Test email templates** with new service
5. **Monitor delivery rates** during transition

The email templates and logic remain the same - only the sending mechanism changes.

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

- **[Feature Specifications](./.kiro/specs/team-management-mvp/)** - Detailed requirements, design, and implementation plan
- **[Setup Progress](./SETUP.md)** - Development setup and progress tracking
- **[Contributing Guide](./.github/CONTRIBUTING.md)** - How to contribute to the project
- **[Release Process](./.github/RELEASE_TEMPLATE.md)** - Release workflow and versioning
- **[CI/CD Automation](./.github/AUTOMATION.md)** - GitHub Actions and automation
- **[Security Implementation](./docs/SECURITY_IMPLEMENTATION.md)** - Security measures and best practices

### API Documentation

The application uses Next.js Server Actions for most operations. Key actions include:

- **Authentication**: `lib/actions/auth.ts` - Signup, login, session management
- **Team Management**: `lib/actions/team.ts` - Create and manage teams
- **Roster Operations**: `lib/actions/roster.ts` - Add, update, delete players
- **Event Management**: `lib/actions/events.ts` - CRUD operations for events
- **RSVP System**: `lib/actions/rsvp.ts` - Update attendance responses
- **Invitations**: `lib/actions/invitations.ts` - Send and manage invitations

### Database Schema

The database uses PostgreSQL with Prisma ORM. Key models:

- **User**: Authentication and user profiles
- **Team**: Team information and settings
- **TeamMember**: User-team relationships with roles (Admin/Member)
- **Player**: Roster entries with contact information
- **Event**: Games and practices with scheduling details
- **RSVP**: Attendance responses for events
- **Invitation**: Email invitations with tokens and expiration

See `prisma/schema.prisma` for complete schema definition.

### External Documentation

- **[Next.js 15 Documentation](https://nextjs.org/docs)** - App Router, Server Actions, React 19
- **[MUI v7 Documentation](https://mui.com/material-ui/)** - Components, theming, customization
- **[Prisma Documentation](https://www.prisma.io/docs)** - ORM, migrations, client usage
- **[Auth.js Documentation](https://authjs.dev/)** - Authentication configuration and providers
- **[Neon Documentation](https://neon.tech/docs)** - Serverless PostgreSQL setup and management
- **[Mailchimp Transactional](https://mailchimp.com/developer/transactional/)** - Email API and templates
- **[Vercel Documentation](https://vercel.com/docs)** - Deployment, environment variables, functions
- **[Conventional Commits](https://www.conventionalcommits.org/)** - Commit message format
- **[Semantic Versioning](https://semver.org/)** - Version numbering scheme
