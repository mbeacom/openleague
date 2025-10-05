# Database

This directory contains database configuration and utilities.

## Files

- `prisma.ts` - Singleton Prisma client instance

## Pattern

```typescript
// lib/db/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

## Usage

```typescript
import { prisma } from '@/lib/db/prisma';

const users = await prisma.user.findMany();
```

## Best Practices

1. Always use the singleton instance exported from this file
2. Never instantiate PrismaClient directly in other files
3. All queries are automatically parameterized (SQL injection safe)
4. Use Prisma's type-safe query builders
