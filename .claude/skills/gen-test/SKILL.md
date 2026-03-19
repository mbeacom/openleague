---
name: gen-test
description: "Generate Vitest tests for a server action or component, following project conventions with Prisma mocks"
disable-model-invocation: true
---

# Generate Tests

Generate Vitest tests following the project's existing patterns.

## Arguments

Accepts a file path or module name to generate tests for (e.g., `/gen-test lib/actions/team.ts`).

## Conventions

- Tests go in `__tests__/` mirroring the source path (e.g., `lib/actions/team.ts` -> `__tests__/lib/actions/team.test.ts`)
- Use `describe`/`it`/`expect` from `vitest`
- Mock Prisma with `vi.mock('@/lib/db/prisma')`
- Mock auth with `vi.mock('@/lib/auth/session')`
- Test both success and error paths
- Validate Zod schemas reject invalid input
- Verify auth checks (requireUserId, requireTeamAdmin) are called

## Steps

1. **Read the source file** to understand its exports, types, and dependencies
2. **Read existing tests** in `__tests__/` for pattern reference
3. **Generate test file** with mocks for Prisma, auth session, and any external services
4. **Run the tests** with `bun run test <path>` to verify they pass
5. **Fix any failures** and re-run until green

## Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma — replace <modelName> with actual model delegates
// used by the module under test (e.g., prisma.team, prisma.player)
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    // Example: mocking the 'team' model
    team: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // Add other model delegates as needed
  },
}));

vi.mock('@/lib/auth/session', () => ({
  requireUserId: vi.fn().mockResolvedValue('test-user-id'),
  requireTeamAdmin: vi.fn().mockResolvedValue(undefined),
}));
```
