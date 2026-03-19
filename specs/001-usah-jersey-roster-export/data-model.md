# Data Model: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

**Branch**: `001-usah-jersey-roster-export` | **Date**: 2026-03-19

---

## Schema Changes

### 1. `Player` model — new fields

```prisma
model Player {
  // ... existing fields ...

  jerseyNumber  Int?    // Optional jersey number (1–99). No unique constraint; duplicates trigger warning only.
  usahMemberId  String? @db.VarChar(20)  // USA Hockey Member ID. Admin-only. Alphanumeric, max 20 chars.
}
```

**Migration**: Add two nullable columns with no defaults. Existing player rows get NULL for both. No data backfill needed.

**Index**: No index needed — these fields are not used in WHERE clauses, only SELECTs.

---

### 2. `TeamMember` model — new field

```prisma
model TeamMember {
  // ... existing fields ...

  usahMemberId  String? @db.VarChar(20)  // USA Hockey Member ID for team official. Admin-only.
}
```

**Migration**: Add one nullable column. Existing rows get NULL. No data backfill needed.

---

## Validation Rules

### Jersey Number (`Player.jerseyNumber`)
- Type: Integer
- Range: 1–99 (inclusive)
- Optional (nullable)
- No uniqueness constraint at DB level
- Duplicate check performed in Server Action; returns `warning` in response if duplicate found on same team

### USA Hockey Member ID (`Player.usahMemberId`, `TeamMember.usahMemberId`)
- Type: String, max 20 characters
- Pattern: Alphanumeric only (`/^[a-zA-Z0-9]+$/`)
- Optional (nullable)
- Leading/trailing whitespace trimmed before save (handled by Zod schema)
- Visibility: Admin-only — excluded from public-facing query `select` projections

---

## Updated Type Definitions

### `Player` type (`types/roster.ts`)

The base `Player` type gains two new optional fields:

```typescript
export type Player = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;   // admin-only
  emergencyPhone: string | null;     // admin-only
  jerseyNumber: number | null;       // NEW — visible to all team members
  usahMemberId: string | null;       // NEW — admin-only
};
```

> Note: `jerseyNumber` is visible to all team members. `usahMemberId` is admin-only and must be excluded from non-admin query selects (same pattern as `emergencyContact`).

### `TeamMemberWithUsah` type (new, for admin official views)

```typescript
export type TeamMemberWithUser = {
  id: string;
  role: "ADMIN" | "MEMBER";
  joinedAt: Date;
  usahMemberId: string | null;       // NEW — admin-only
  user: {
    id: string;
    name: string | null;
    email: string;
  };
};
```

---

## Zod Schema Changes (`lib/utils/validation.ts`)

### Extended `addPlayerSchema`

```typescript
export const addPlayerSchema = z.object({
  // ... existing fields unchanged ...
  jerseyNumber: z.number().int().min(1).max(99).nullable().optional(),
  usahMemberId: z
    .string()
    .trim()
    .max(20)
    .regex(/^[a-zA-Z0-9]*$/, "USA Hockey ID must be alphanumeric")
    .nullable()
    .optional(),
});
```

`updatePlayerSchema` extends `addPlayerSchema` (already uses `.extend()`), so it inherits both new fields automatically.

### New `updateTeamMemberUsahIdSchema`

```typescript
export const updateTeamMemberUsahIdSchema = z.object({
  teamMemberId: z.string().cuid("Invalid team member ID"),
  teamId: z.string().cuid("Invalid team ID"),
  usahMemberId: z
    .string()
    .trim()
    .max(20)
    .regex(/^[a-zA-Z0-9]*$/, "USA Hockey ID must be alphanumeric")
    .nullable()
    .optional(),
});
```

---

## Query Projections

### Public roster query (non-admin) — include `jerseyNumber`, exclude `usahMemberId`

```typescript
select: {
  id: true,
  name: true,
  email: true,
  phone: true,
  jerseyNumber: true,       // visible to all
  // usahMemberId omitted  // admin-only
}
```

### Admin roster query — include both fields

```typescript
select: {
  id: true,
  name: true,
  email: true,
  phone: true,
  emergencyContact: true,
  emergencyPhone: true,
  jerseyNumber: true,
  usahMemberId: true,       // admin-only
}
```

### CSV export query — include all participant fields

Players:
```typescript
select: { id, name, email, jerseyNumber, usahMemberId }
```

TeamMembers (ADMIN role only — coaches/managers):
```typescript
select: {
  id: true,
  usahMemberId: true,
  user: { select: { name: true, email: true } }
}
```

---

## Roster Export CSV Format

**File name**: `roster-{teamName}-{YYYY-MM-DD}.csv`
**Encoding**: UTF-8 (with BOM for Excel compatibility)
**Columns** (fixed order):

| Column | Source | Notes |
|--------|--------|-------|
| Full Name | `player.name` / `member.user.name` | |
| Role | "Player" / "Coach" / "Manager" | ADMIN TeamMembers labeled "Team Official" |
| Jersey Number | `player.jerseyNumber` | Blank for team officials and players without a number |
| USA Hockey Member ID | `usahMemberId` | Blank if not set |
| Email | `player.email` / `member.user.email` | |

**Row order**: Team officials first (alphabetical), then players sorted by jersey number ascending (nulls last), then alphabetical by name.

---

## New Route

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/roster/export?teamId={id}` | Session (team admin required) | Returns CSV file download |
