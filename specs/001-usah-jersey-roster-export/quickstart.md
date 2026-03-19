# Quickstart: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

**Branch**: `001-usah-jersey-roster-export`

---

## Prerequisites

```bash
git checkout 001-usah-jersey-roster-export
bun install
```

Ensure `DATABASE_URL` is set in `.env.local` (Neon connection string with `?sslmode=require`).

---

## Step 1: Apply DB Migration

```bash
bun run db:migrate
# Name the migration: add_jersey_number_usah_member_id
bun run db:generate
```

This adds:
- `Player.jerseyNumber Int?`
- `Player.usahMemberId String? @db.VarChar(20)`
- `TeamMember.usahMemberId String? @db.VarChar(20)`

---

## Step 2: Verify Migration

```bash
bun run db:studio
```

Confirm `Player` and `TeamMember` tables show the new nullable columns.

---

## Step 3: Run Type Check

```bash
bun run type-check
```

Should pass after schema + Prisma client regeneration.

---

## Step 4: Dev Server

```bash
bun run dev
```

Navigate to `/roster` — jersey numbers should display alongside player names (blank until set).

---

## Step 5: Test Export

1. Add a few players with jersey numbers and USAH IDs via the roster UI
2. As a team admin, click "Export Roster (CSV)" on the roster page
3. Open the downloaded file — verify columns, encoding, and row order

---

## Key Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `jerseyNumber`, `usahMemberId` to `Player`; `usahMemberId` to `TeamMember` |
| `lib/utils/validation.ts` | Extend player schemas; add `updateTeamMemberUsahIdSchema` |
| `lib/actions/roster.ts` | Update `addPlayer`, `updatePlayer`; add `updateTeamMemberUsahId` |
| `app/api/roster/export/route.ts` | New Route Handler for CSV download |
| `types/roster.ts` | Add `jerseyNumber`, `usahMemberId` to `Player` type; new `TeamMemberWithUser` type |
| `components/features/roster/AddPlayerDialog.tsx` | Add jersey number and USAH ID fields |
| `components/features/roster/PlayerCard.tsx` | Display jersey number; show USAH ID for admins |
| `components/features/roster/RosterList.tsx` | Add Export CSV button (admin-only) |

---

## Running Tests

```bash
bun run test __tests__/lib/actions/roster.test.ts
bun run test __tests__/lib/utils/validation.test.ts
bun run test __tests__/api/roster/export.test.ts
```
