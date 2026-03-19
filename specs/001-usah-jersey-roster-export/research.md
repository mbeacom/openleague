# Research: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

**Branch**: `001-usah-jersey-roster-export` | **Date**: 2026-03-19

## Decision Log

### 1. Jersey Number Storage

**Decision**: Store `jerseyNumber` as a nullable `Int` on the `Player` model.

**Rationale**: An integer column allows numeric sorting, range validation at the DB level, and is idiomatic for jersey numbers. Storing as a string would require extra parsing for sorting/display. Nullable because jersey numbers are optional.

**Alternatives considered**:
- String: Rejected — no benefit for numbers-only field; complicates sorting.
- Separate JerseyAssignment table: Rejected — over-engineered for a single optional integer field.

---

### 2. USA Hockey Member ID Storage — Players

**Decision**: Store `usahMemberId` as a nullable `String` (max 20) on the `Player` model.

**Rationale**: USA Hockey Member IDs are alphanumeric identifiers. String is the correct type. Stored directly on `Player` alongside other player profile fields. Admin-only visibility enforced at the application layer (same pattern as `emergencyContact`/`emergencyPhone`).

**Alternatives considered**:
- Separate RegistrationId table: Rejected — no need for multi-association support in this iteration. Can be migrated later if needed.

---

### 3. USA Hockey Member ID Storage — Team Officials (Coaches/Managers)

**Decision**: Store `usahMemberId` as a nullable `String` (max 20) on the `TeamMember` model.

**Rationale**: Team officials (coaches and managers) are represented by `TeamMember` records with `ADMIN` role. There is no separate "Coach" model. Adding `usahMemberId` to `TeamMember` is the minimal correct location — it attaches to the team-scoped membership, consistent with how other team-scoped data is stored.

**Alternatives considered**:
- Store on `User` model: Rejected — a user could be an admin on multiple teams in different leagues; the USA Hockey ID is per-team-membership context.
- New TeamOfficial model: Rejected — over-engineered. `TeamMember` with ADMIN role already represents this.

---

### 4. CSV Export Delivery Strategy

**Decision**: Implement CSV export as a Next.js Route Handler (`app/api/roster/export/route.ts`) that streams a CSV `Response`, triggered by a client-side link/button initiating a GET request.

**Rationale**:
- The CLAUDE.md architecture specifies Route Handlers for webhooks and external integrations; CSV export is a data-extraction endpoint that fits the Route Handler model (returns a non-HTML response).
- Server Actions cannot directly return file downloads (they return serializable data). A Route Handler can set `Content-Disposition: attachment` and stream CSV bytes.
- A simple GET endpoint with `teamId` in the query string is secure when protected by session auth in the route handler itself.

**Alternatives considered**:
- Server Action returning base64-encoded CSV string: Rejected — wasteful, requires client-side Blob construction, poor UX for large rosters.
- Client-side CSV generation: Rejected — requires sending all admin-only fields (USAH IDs) to the client, which violates the admin-only visibility requirement.

---

### 5. Duplicate Jersey Number Handling

**Decision**: Non-blocking warning returned from the `updatePlayer`/`addPlayer` action alongside a successful save. Check performed in the Server Action before committing, then included in the success response as `warning: string | undefined`.

**Rationale**: USA Hockey rosters can have mid-season number reassignments. A hard block would frustrate admins. Warning is surfaced in the UI via toast. No DB-level unique constraint added.

**Alternatives considered**:
- DB unique constraint: Rejected — spec explicitly requires warning-not-block behavior.
- Client-side only check: Rejected — race condition risk; must be server-side.

---

### 6. RFC 4180 CSV Encoding

**Decision**: Hand-write minimal CSV serialization using standard quoting rules (wrap fields containing commas, quotes, or newlines in double-quotes; escape embedded double-quotes as `""`). No third-party CSV library needed.

**Rationale**: The roster export has a fixed, small number of columns. A dependency on a CSV library is unnecessary complexity for this use case. RFC 4180 compliance can be achieved in ~15 lines of utility code.

**Alternatives considered**:
- `csv-stringify` or similar npm package: Rejected — adds a dependency for a trivial transformation. Can be introduced later if export scope grows significantly.

---

### 7. Admin-Only Field Visibility Pattern

**Decision**: Follow the existing `emergencyContact`/`emergencyPhone` pattern — fields are excluded from public-facing query selects and only included when the caller has verified admin role.

**Rationale**: This is the established pattern in the codebase (see `lib/actions/roster.ts` and `types/roster.ts`). Consistent pattern avoids confusion.

---

### 8. Validation Schema Placement

**Decision**: Add jersey number and USAH ID fields to the existing `addPlayerSchema` and `updatePlayerSchema` in `lib/utils/validation.ts`. Add a new `updateTeamMemberUsahIdSchema` for the team official USAH ID update action.

**Rationale**: Follows the existing pattern where all Zod schemas live in `lib/utils/validation.ts`. Extending existing player schemas minimizes diff surface area.
