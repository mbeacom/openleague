# Data Model: Ice Rink Management

## Existing Model Reuse

### Venue

Current `Venue` records already represent structured locations and are referenced by `Event` and game schedules. This feature should preserve those relationships and extend `Venue` into a richer public rink profile.

**Existing fields retained**: name, address, city, state, zip code, surface type, capacity, amenities, phone, website, notes, visibility, active status, team ownership, league ownership, creator, events.

**New responsibilities**: organization ownership, branding, publication status, public description, logo, public/private contact separation, timezone, slug, and profile completeness.

## New and Extended Entities

### VenueOrganization

Represents the rink, arena operator, skating center, or venue business that owns profiles and staff access.

**Fields**:

- id
- name
- type: rink, arena, skating center, sports complex, other
- description
- primaryContactName
- primaryContactEmail
- primaryContactPhone
- website
- status: draft, active, suspended, archived
- createdById
- createdAt
- updatedAt

**Relationships**:

- Has many venue profiles
- Has many staff memberships
- Has many relationship invitations

**Validation**:

- Name is required and user-safe.
- Contact email must be valid when provided.
- Archived organizations cannot publish new schedule blocks.

### VenueStaff

Assigns users to venue organizations or specific venues with management permissions.

**Fields**:

- id
- organizationId
- venueId optional
- userId
- role: owner, manager, scheduler, content editor, request manager, viewer
- status: invited, active, removed
- invitedById
- joinedAt
- createdAt
- updatedAt

**Relationships**:

- Belongs to a user
- Belongs to a venue organization
- Optionally scoped to a venue

**Validation**:

- Each user can have only one active staff role for the same organization and venue scope.
- At least one owner must remain active for an organization.

### VenueProfile Extension

Implemented by extending `Venue`.

**Additional fields**:

- organizationId optional for migrated/team-owned venues
- slug
- publicDescription
- logoUrl
- brandPrimaryColor
- brandSecondaryColor
- timezone
- publicEmail
- publicPhone
- privateManagerNotes
- profileStatus: draft, published, unpublished, archived
- publishedAt

**Validation**:

- Published profiles require name, address or clear location details, timezone, public contact method, and at least one authorized owner/manager.
- Slug must be unique among published profiles.
- Brand colors must be valid color values.
- Manager notes must never appear in public profile responses.

### IceSurface

Represents a bookable rink sheet, studio, room, or activity area.

**Fields**:

- id
- venueId
- name
- surfaceType: ice, studio, room, dryland, other
- capacity
- isDefault
- isActive
- displayOrder
- notes
- createdAt
- updatedAt

**Relationships**:

- Belongs to a venue
- Has many operating hours
- Has many schedule blocks

**Validation**:

- Each venue must have at least one active surface before schedule publication.
- Surface names must be unique within a venue.

### VenueOperatingHour

Defines standard and exception-based open/closed periods.

**Fields**:

- id
- venueId
- surfaceId optional
- dayOfWeek
- opensAt
- closesAt
- effectiveStartDate
- effectiveEndDate optional
- status: open, closed, restricted
- label optional
- notes optional

**Relationships**:

- Belongs to a venue
- Optionally belongs to a surface

**Validation**:

- Close time must be after open time unless the period intentionally crosses midnight.
- Date ranges cannot overlap with conflicting statuses for the same venue/surface/day.

### VenueScheduleBlock

Represents recurring or one-time public programs, lessons, available ice, rentals, closures, and events.

**Fields**:

- id
- venueId
- surfaceId optional
- title
- description
- activityType: open skate, stick and pick, free skate, figure skating, specialty event, private lesson, public lesson, team ice, organization ice, rental, closure, custom
- audience: public, teams, coaches, organizations, invite-only, staff-only
- visibility: public, authenticated, relationship-only, private
- status: draft, published, canceled, archived
- startsAt
- endsAt
- recurrenceRule optional
- recurrenceStartDate optional
- recurrenceEndDate optional
- capacity optional
- priceAmount optional
- priceCurrency
- priceLabel optional
- registrationMode: information only, request required, external registration
- externalRegistrationUrl optional
- createdById
- updatedById
- createdAt
- updatedAt

**Relationships**:

- Belongs to a venue
- Optionally belongs to a surface
- May have many requests
- May reference lesson offerings or venue events

**Validation**:

- End time must be after start time.
- Published blocks must have title, activity type, visibility, and valid schedule timing.
- Public or requestable blocks must not expose manager-only notes.
- Conflicting published blocks for the same surface require explicit override or rejection.

### IceTimeRequest

Tracks team, coach, organization, or individual interest in an available schedule block.

**Fields**:

- id
- scheduleBlockId
- venueId
- requesterUserId
- requesterTeamId optional
- requesterLeagueId optional
- requesterOrganizationName optional
- contactName
- contactEmail
- contactPhone optional
- requestedStartAt
- requestedEndAt
- notes
- status: submitted, under review, accepted, declined, canceled, expired
- decisionMessage optional
- decidedById optional
- decidedAt optional
- createdAt
- updatedAt

**Relationships**:

- Belongs to a schedule block
- Belongs to a venue
- Belongs to the requester user
- Optionally references a team or league

**State Transitions**:

- submitted -> under review
- submitted or under review -> accepted
- submitted or under review -> declined
- submitted or under review -> canceled by requester
- submitted or under review -> expired
- accepted -> canceled only by authorized rink manager or requester with business rules

**Validation**:

- Requester must be authenticated.
- Accepted requests must not overlap an already accepted request for the same schedule block/surface unless explicitly allowed.
- Decline and cancellation messages must be user-safe.

### LessonOffering

Represents public or private instruction offered by the rink.

**Fields**:

- id
- venueId
- surfaceId optional
- title
- description
- lessonType: private, semi-private, group, clinic, camp
- instructorName optional
- priceAmount optional
- priceCurrency
- durationMinutes optional
- availabilityDescription
- registrationMode
- externalRegistrationUrl optional
- status: draft, published, archived
- createdAt
- updatedAt

**Relationships**:

- Belongs to a venue
- May link to schedule blocks
- May link to skill-level references

**Validation**:

- Published offerings require title, lesson type, availability or schedule link, and registration/request instructions.

### VenueContentPost

Represents posts, announcements, and blog-style content.

**Fields**:

- id
- venueId
- authorId
- title
- slug
- excerpt optional
- body
- status: draft, scheduled, published, unpublished, archived
- publishedAt optional
- scheduledFor optional
- createdAt
- updatedAt

**Relationships**:

- Belongs to a venue
- Belongs to an author

**State Transitions**:

- draft -> scheduled
- draft or scheduled -> published
- published -> unpublished
- any non-archived state -> archived

**Validation**:

- Published posts require title, body, author, and publish timestamp.
- Slug must be unique within a venue.

### VenueRelationship

Represents a preferred or home venue designation between a rink and a team, coach, league, or organization.

**Fields**:

- id
- venueId
- relationshipType: preferred, home
- targetType: team, league, coach, organization
- teamId optional
- leagueId optional
- targetName optional
- invitedEmail optional
- status: pending, active, rejected, removed, expired
- invitedById
- acceptedById optional
- removedById optional
- expiresAt optional
- createdAt
- updatedAt

**Relationships**:

- Belongs to a venue
- Optionally belongs to a team or league
- References invitation and decision users

**State Transitions**:

- pending -> active
- pending -> rejected
- pending -> expired
- active -> removed

**Validation**:

- Target authority must be verified before activation.
- Active home relationships should be visible on both venue and team/organization profiles.

### SkillLevelReference

Represents optional skating or hockey level labels used for eligibility and filtering.

**Fields**:

- id
- source: USA Hockey, US Figure Skating, rink custom, other
- discipline: hockey, figure skating, skating, goalie, other
- label
- description optional
- sortOrder optional
- isActive

**Relationships**:

- Can be associated with schedule blocks and lesson offerings

**Validation**:

- Source + discipline + label should be unique.
- Custom levels must be clearly distinguishable from recognized governing-body levels.

### VenueActivityLog

Provides user-facing operational history for significant venue management events.

**Fields**:

- id
- venueId
- actorId
- action
- resourceType
- resourceId
- summary
- details optional
- createdAt

**Relationships**:

- Belongs to a venue
- Belongs to an actor user

**Validation**:

- Private details must not be shown in public-facing activity.

## Public Data Boundaries

Public venue profile responses may include name, logo, brand colors, public description, address, public phone/email, website, amenities, published schedule blocks, published lessons, published events, and published posts.

Manager-only responses may include private notes, request contact details, staff assignments, draft/unpublished content, audit details, internal visibility settings, and pending relationship invitations.

## Migration Notes

- Existing `Venue` records should remain valid after migration.
- Existing team/league ownership fields may remain for backward compatibility.
- A backfill should create a default surface for existing active venues when schedule blocks require a surface.
- Existing `Event.venueId` references must continue to work without requiring a venue organization.
