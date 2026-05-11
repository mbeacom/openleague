# Quickstart: Ice Rink Management

## Prerequisites

- Use Bun for all package and script commands.
- Ensure required environment variables are configured for local development.
- Start from branch `002-ice-rink-management`.

## Implementation Workflow

1. Review the feature specification and plan:

   ```bash
   sed -n '1,240p' specs/002-ice-rink-management/spec.md
   sed -n '1,260p' specs/002-ice-rink-management/plan.md
   ```

2. Create or update validation schemas in `lib/utils/validation.ts` for each Server Action input:

   - Venue organization/profile setup
   - Staff invitations and role updates
   - Surface management
   - Operating hours
   - Schedule blocks and recurrence
   - Ice-time requests
   - Lesson offerings
   - Venue posts
   - Venue relationships

3. Add Prisma schema changes and create a migration:

   ```bash
   bun run db:migrate
   bun run db:generate
   ```

4. Implement Server Actions in feature-focused files under `lib/actions/`:

   - `venue-organizations.ts`
   - `venue-schedules.ts`
   - `venue-requests.ts`
   - `venue-content.ts`
   - `venue-relationships.ts`

5. Add route and component slices in independent story order:

   1. Venue organization onboarding and branded profile
   2. Surfaces, operating hours, and schedule blocks
   3. Available ice browsing and request lifecycle
   4. Lessons, events, and content posts
   5. Preferred/home venue relationships
   6. Skill-level labels and filters

6. Add tests alongside implementation:

   ```bash
   bun run test __tests__/lib/utils/validation-venue.test.ts
   bun run test __tests__/lib/actions/venue-organizations.test.ts
   bun run test __tests__/lib/actions/venue-schedules.test.ts
   bun run test __tests__/lib/actions/venue-requests.test.ts
   bun run test __tests__/lib/actions/venue-content-lessons.test.ts
   bun run test __tests__/lib/actions/venue-relationships.test.ts
   bun run test __tests__/lib/actions/venue-skill-levels.test.ts
   ```

7. Run repository validation before opening a PR:

   ```bash
   bun run lint
   bun run type-check
   bun run test
   ```

## Manual Acceptance Checks

### Profile Setup

1. Sign in as a new rink owner.
2. Create a venue organization and draft profile.
3. Upload or set a logo reference, choose brand colors, complete required profile fields.
4. Publish the profile and verify the public venue page shows only public-safe data.

### Schedule Setup

1. Create at least one ice surface.
2. Add weekly operating hours.
3. Add recurring open skate, stick and pick, figure skating, lesson, and available ice blocks.
4. Confirm conflicts are shown before overlapping blocks are published.

### Request Flow

1. Publish an available ice-time block.
2. Sign in as a team admin or coach.
3. Submit a request for the block.
4. Sign in as a venue manager and accept or decline the request.
5. Confirm both requester and manager views show the updated status.

### Relationship Flow

1. Invite a team to mark the venue as preferred or home rink.
2. Accept the invitation as an authorized team admin.
3. Confirm the relationship appears on both venue and team surfaces.

### Content and Skill-Level Flow

1. Publish a lesson offering, specialty event, and rink post from the content manager.
2. Assign one or more skill-level labels to a lesson or schedule block.
3. Confirm public rink profile content only shows published entries.
4. Confirm `/rinks/[slug]/schedule?level=[skillLevelId]` narrows the public schedule without blocking untagged publishing workflows.

## Known Baseline Considerations

Full test runs may expose pre-existing failures outside this feature area. Feature work should still keep lint, type-check, and focused tests for changed areas passing.

The local development database may report migration drift from earlier schema history. Do not run destructive migration resets without explicit approval.
