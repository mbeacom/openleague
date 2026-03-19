---
name: db-migrate
description: "Create a Prisma database migration: edit schema, run migrate dev, generate client, and verify types"
disable-model-invocation: true
---

# Database Migration Workflow

Run this skill after editing `prisma/schema.prisma` to safely create and apply a migration.

## Steps

1. **Review schema changes** — Read `prisma/schema.prisma` and identify what changed
2. **Create and apply migration** — Run `bun run db:migrate` (prompts for migration name)
3. **Regenerate Prisma Client** — Run `bun run db:generate` to update TypeScript types
4. **Type-check** — Run `bun run type-check` to verify no type errors from schema changes
5. **Report** — Summarize what was migrated and any type errors to fix

## Important

- Always commit both `schema.prisma` and the new migration file together
- Never use `db:push` for changes that need to be tracked (use for prototyping only)
- Never use `db:migrate:reset` without explicit user confirmation — it destroys all data
- If migration fails, read the error carefully — common issues are missing defaults on new required columns
