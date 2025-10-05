# Database

This directory contains database configuration and utilities.

## Files

- `prisma.ts` - Singleton Prisma client instance

## Setup Instructions

### 1. Create a Neon Database

1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project
3. Copy the connection string

### 2. Configure Environment Variables

Update the `DATABASE_URL` in `.env.local` with your Neon connection string:

```bash
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"
```

### 3. Run Database Migration

After configuring the DATABASE_URL, run:

```bash
bunx prisma migrate dev --name init
```

This will:
- Create all database tables based on the Prisma schema
- Generate the Prisma Client with TypeScript types

### 4. View Database (Optional)

To open Prisma Studio and view your database:

```bash
bunx prisma studio
```

## Usage

```typescript
import { prisma } from '@/lib/db/prisma';

// Example: Fetch all users
const users = await prisma.user.findMany();

// Example: Create a team
const team = await prisma.team.create({
  data: {
    name: 'My Team',
    sport: 'Soccer',
    season: 'Fall 2025',
  },
});
```

## Best Practices

1. Always use the singleton instance exported from this file
2. Never instantiate PrismaClient directly in other files
3. All queries are automatically parameterized (SQL injection safe)
4. Use Prisma's type-safe query builders
