# Authentication

This directory contains Auth.js (NextAuth.js) configuration and session utilities.

## Files

- `config.ts` - Auth.js options and configuration
- `session.ts` - Session utilities (`getSession()`, `requireAuth()`)

## Pattern

### Session Helpers

```typescript
// lib/auth/session.ts
import { getServerSession } from 'next-auth';
import { authOptions } from './config';

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}
```

### Usage in Server Actions

```typescript
'use server'

import { requireAuth } from '@/lib/auth/session';

export async function protectedAction() {
  const session = await requireAuth(); // Throws if not authenticated
  if (!session.user.id) throw new Error('Unauthorized');

  // Your protected logic here
}
```
