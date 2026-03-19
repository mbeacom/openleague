---
name: new-action
description: "Scaffold a new Server Action with auth, Zod validation, Prisma mutation, revalidation, and ActionResult types"
disable-model-invocation: true
---

# New Server Action

Scaffolds a Server Action following the project's established pattern.

## Arguments

Accepts a name and optional description (e.g., `/new-action updatePlayerStatus "Update a player's active/inactive status"`).

## Steps

1. **Determine file location** — New action goes in `lib/actions/<name>.ts` (or add to an existing file if it fits)
2. **Check the Prisma schema** — Read `prisma/schema.prisma` to understand the relevant models and relations
3. **Check existing validation schemas** — Read `lib/utils/validation.ts` for existing Zod schemas to reuse
4. **Create the Zod schema** — Add to `lib/utils/validation.ts` with proper constraints
5. **Create the Server Action** — Following the template below
6. **Type-check** — Run `bun run type-check` to verify

## Template

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, requireTeamAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Import or define Zod schema from lib/utils/validation.ts
const inputSchema = z.object({
  // Define fields with proper constraints
});

export async function actionName(
  input: z.infer<typeof inputSchema>
): Promise<ActionResult<ReturnType>> {
  try {
    // 1. Authenticate
    const userId = await requireUserId();

    // 2. Validate input
    const validated = inputSchema.parse(input);

    // 3. Authorize (check team/league role as needed)
    await requireTeamAdmin(validated.teamId);

    // 4. Perform mutation
    const result = await prisma.model.create({
      data: { ...validated },
    });

    // 5. Revalidate affected paths
    revalidatePath("/affected-path");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.flatten() };
    }
    return { success: false, error: "An unexpected error occurred" };
  }
}
```

## Rules

- Always use `requireUserId()` as the first operation
- Always validate with Zod before any database access
- Always check authorization for team/league scoped operations
- Always use `revalidatePath()` after mutations
- Never expose internal error messages to the client
- Never return sensitive fields (password hashes, tokens, emergency contacts for non-admins)
- Use Prisma — never raw SQL
