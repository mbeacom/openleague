# Server Actions

This directory contains Next.js Server Actions for handling data mutations and server-side logic.

## Structure

- `team.ts` - Team creation and management actions
- `roster.ts` - Player roster CRUD operations
- `events.ts` - Event scheduling and management actions
- `rsvp.ts` - RSVP update actions
- `invitations.ts` - Invitation sending and management actions

## Pattern

All Server Actions must:
1. Include `'use server'` directive at the top
2. Start with authentication check using `requireAuth()`
3. Validate inputs using Zod schemas
4. Check user authorization before mutations
5. Use Prisma for database operations
6. Return success/error responses

## Example

```typescript
'use server'

import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { teamSchema } from '@/lib/utils/validation';

export async function createTeam(data: CreateTeamInput) {
  const session = await requireAuth();
  if (!session.user?.id) throw new Error('Unauthorized');

  const validated = teamSchema.parse(data);

  return await prisma.team.create({
    data: {
      ...validated,
      members: {
        create: { userId: session.user.id, role: 'ADMIN' }
      }
    }
  });
}
```
