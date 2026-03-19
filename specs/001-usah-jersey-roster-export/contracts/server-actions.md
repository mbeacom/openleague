# Server Action Contracts

**Feature**: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

---

## Modified Actions (`lib/actions/roster.ts`)

### `addPlayer(input: AddPlayerInput): Promise<ActionResult<Player>>`

**Change**: Accepts two new optional fields. Performs duplicate jersey number check.

**Input** (extended `AddPlayerInput`):
```typescript
{
  name: string;
  email?: string;
  phone?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  teamId: string;            // cuid
  jerseyNumber?: number;     // NEW — integer 1–99, optional
  usahMemberId?: string;     // NEW — alphanumeric max 20, optional
}
```

**Success response**:
```typescript
{
  success: true;
  data: Player;
  warning?: string;   // NEW — e.g. "Jersey #7 is already assigned to Jane Doe"
}
```

**Error response** (unchanged shape):
```typescript
{ success: false; error: string; details?: unknown }
```

---

### `updatePlayer(input: UpdatePlayerInput): Promise<ActionResult<Player>>`

**Change**: Accepts two new optional fields (inherited from `addPlayerSchema.extend()`). Performs duplicate jersey number check (excluding the player being updated).

**Input** (extended `UpdatePlayerInput`):
```typescript
{
  id: string;
  // ...same as AddPlayerInput...
  jerseyNumber?: number | null;   // NEW — null clears the jersey number
  usahMemberId?: string | null;   // NEW — null clears the USAH ID
}
```

**Success/Error response**: Same shape as `addPlayer`.

---

## New Actions (`lib/actions/roster.ts`)

### `updateTeamMemberUsahId(input): Promise<ActionResult<TeamMember>>`

Updates the USA Hockey Member ID for a team official (coach/manager).

**Input**:
```typescript
{
  teamMemberId: string;    // cuid
  teamId: string;          // cuid — used for auth check
  usahMemberId: string | null;   // null clears the ID
}
```

**Authorization**: Caller must be team admin (`requireTeamAdmin(teamId)`).

**Success response**:
```typescript
{ success: true; data: { id: string; usahMemberId: string | null } }
```

**Error response**:
```typescript
{ success: false; error: string }
```

---

## New Route Handler (`app/api/roster/export/route.ts`)

### `GET /api/roster/export?teamId={cuid}`

Returns a CSV file download of the complete team roster.

**Authentication**: Session required. Caller must be team admin for the given `teamId`.

**Query parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `teamId` | cuid string | Yes | Team to export |

**Success response**:
```
HTTP 200
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="roster-{teamName}-{YYYY-MM-DD}.csv"

Full Name,Role,Jersey Number,USA Hockey Member ID,Email
...rows...
```

**Error responses**:
| Status | Condition |
|--------|-----------|
| 401 | Not authenticated |
| 403 | Authenticated but not a team admin |
| 400 | Missing or invalid `teamId` |
| 404 | Team not found |
