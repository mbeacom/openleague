# Prisma Schema TODOs and Future Improvements

## High Priority (Before Production)

### 1. Invitation.invitedById Cascade Behavior
**Current**: `ON DELETE RESTRICT` - prevents user deletion if they've sent invitations
**Issue**: Users cannot delete their accounts if they've ever invited someone
**Recommendation**: Change to `ON DELETE SET NULL` to allow user deletion while preserving invitations
**Alternative**: Add `inviterName` text field to preserve attribution after deletion

```prisma
invitedById String?
invitedBy   User?   @relation(fields: [invitedById], references: [id], onDelete: SetNull)
```

## Medium Priority (Performance & Data Integrity)

### 2. Email Format Validation
**Current**: No database-level validation on email fields
**Recommendation**: Add CHECK constraints or rely on application-level validation (Zod)
**Decision**: Use Zod validation in Server Actions (already planned) - DB constraints add minimal value

### 3. Additional Performance Indexes
**Completed**: ✓ Added composite index on Event(teamId, startAt) and index on Event(startAt)
**Future Considerations**:
- Index on Player.email for invitation lookups
- Index on Invitation.email for checking existing invitations
- Index on Invitation.expiresAt for cleanup jobs

### 4. Player-User Data Model Clarification
**Current**: Player can link to User via optional userId
**Consideration**: RSVP system only links to User, not Player
**Question**: How do non-User players (e.g., youth players) RSVP?
**MVP Decision**: Only authenticated users (TeamMembers) can RSVP. Players without accounts cannot RSVP directly.
**Future**: Consider parent/guardian RSVP on behalf of Player, or Player-level RSVP

## Low Priority (Post-MVP)

### 5. Soft Deletes
**Current**: All deletes are hard deletes (CASCADE removes records)
**Future**: Consider soft deletes for audit trail
- Add `deletedAt DateTime?` to models
- Use Prisma middleware to filter deleted records
- Useful for: Teams, Events, Players (roster history)

### 6. Audit Trail
**Future**: Add audit log table to track changes
- Who modified what, when
- Useful for admin accountability
- Required for compliance in some contexts

### 7. Data Archiving
**Future**: Archive old events and RSVPs after season ends
- Separate "archive" schema or table
- Improve query performance
- Maintain historical data

### 8. Multi-Tenancy Optimization
**Future**: If supporting multiple organizations with row-level security
- Add organizationId to Team model
- Add indexes on organizationId for isolation
- Consider database-level RLS policies

## Notes

- **Prisma auto-generates indexes** for all foreign key relations, so explicit indexes for FK fields are redundant
- **Composite indexes** should be ordered with most selective columns first (teamId before startAt)
- **Migration strategy**: Bundle related changes into single migrations to minimize production downtime
- **Index monitoring**: Use `EXPLAIN ANALYZE` in production to identify slow queries needing new indexes
