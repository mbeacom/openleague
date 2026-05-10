# Contract: Public and Authenticated Routes

## Public Routes

### `/rinks`

**Purpose**: Discover published rink and venue profiles.

**Access**: Public.

**Shows**:

- Published venue cards
- Logo and brand accent
- Name, city/state, surface summary, public schedule summary
- Filters for date, activity type, level, and availability when data exists

**Must Not Show**:

- Private manager notes
- Staff information
- Requester contact details
- Draft/unpublished schedules or posts

### `/rinks/[slug]`

**Purpose**: Public venue profile.

**Access**: Public when profile is published.

**Shows**:

- Logo, brand colors, venue name, type, description
- Address and public contact details
- Amenities and policies
- Published schedule blocks and available ice
- Published lessons, public/private lesson offerings, specialty events
- Published posts or announcements
- Preferred/home team relationships marked public

**Empty States**:

- No published schedule: show "Schedule coming soon"
- No available ice: show "No available ice currently listed"
- No posts: hide posts section

### `/rinks/[slug]/schedule`

**Purpose**: Public schedule view.

**Access**: Public for public blocks; authenticated or relationship-gated blocks follow visibility rules.

**Filters**:

- Date range
- Activity type
- Audience
- Price range
- Availability status
- Skill level when present

## Authenticated Venue Admin Routes

### `/venue-admin`

**Purpose**: List venue organizations where the user has staff access.

**Access**: Authenticated venue staff.

**Shows**:

- Organization cards
- Venue profiles
- Draft/published status
- Pending requests
- Upcoming schedule issues

### `/venue-admin/new`

**Purpose**: Rink organization onboarding and first venue profile creation.

**Access**: Authenticated users.

**Flow**:

1. Organization identity
2. Venue profile basics
3. Branding and logo
4. Address/contact details
5. Draft save or publish readiness

### `/venue-admin/[organizationId]/venues/[venueId]/profile`

**Purpose**: Manage profile, branding, logo, address, contact details, amenities, policies, and publication state.

**Access**: Owner or manager.

### `/venue-admin/[organizationId]/venues/[venueId]/surfaces`

**Purpose**: Manage ice sheets and activity areas.

**Access**: Owner, manager, or scheduler.

### `/venue-admin/[organizationId]/venues/[venueId]/schedule`

**Purpose**: Manage operating hours, recurring schedule blocks, closures, lessons, events, and available ice.

**Access**: Owner, manager, or scheduler.

**Required Behaviors**:

- Show conflict warnings before publishing
- Support draft schedule blocks
- Show recurring block summary and exceptions

### `/venue-admin/[organizationId]/venues/[venueId]/requests`

**Purpose**: Review and decide ice-time and lesson requests.

**Access**: Owner, manager, scheduler, or request manager.

**Shows**:

- Submitted requests
- Requester contact and organization details
- Schedule block context
- Status and decision history

### `/venue-admin/[organizationId]/venues/[venueId]/content`

**Purpose**: Manage posts, announcements, and blog-style content.

**Access**: Owner, manager, or content editor.

### `/venue-admin/[organizationId]/venues/[venueId]/relationships`

**Purpose**: Invite teams/leagues/organizations and manage preferred or home venue relationships.

**Access**: Owner or manager.

## Existing Route Compatibility

### `/venues`

The existing dashboard venues route should continue to support team and league scheduling workflows. It may link to richer venue-admin flows only when the current user has venue organization staff access.

### `/venues/[id]`

Existing venue details should remain valid for legacy team/league venues and may display a pointer to the public rink profile when the venue has a published rink organization profile.
