# Utils

This directory contains utility functions and validation schemas.

## Files

- `validation.ts` - Zod schemas for form and data validation

## Validation Pattern

```typescript
// lib/utils/validation.ts
import { z } from 'zod';

export const teamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
  sport: z.string().min(1, 'Sport is required'),
  season: z.string().min(1, 'Season is required'),
});

export const eventSchema = z.object({
  type: z.enum(['GAME', 'PRACTICE']),
  date: z.date().min(new Date(), 'Date cannot be in the past'),
  location: z.string().min(1, 'Location is required'),
  opponent: z.string().optional().refine((val, ctx) =>
    ctx.parent.type === 'GAME' ? !!val : true,
    'Opponent required for games'
  ),
  notes: z.string().optional(),
});

export type CreateTeamInput = z.infer<typeof teamSchema>;
export type CreateEventInput = z.infer<typeof eventSchema>;
```

## Usage

### In Server Actions

```typescript
'use server'

import { teamSchema } from '@/lib/utils/validation';

export async function createTeam(data: CreateTeamInput) {
  const validated = teamSchema.parse(data); // Throws if invalid
  // ...
}
```

### In Client Components

```typescript
import { teamSchema } from '@/lib/utils/validation';

const result = teamSchema.safeParse(formData);
if (!result.success) {
  setErrors(result.error.flatten().fieldErrors);
}
```
