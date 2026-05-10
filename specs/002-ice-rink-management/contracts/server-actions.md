# Contract: Server Actions

All mutations return the existing action-result shape:

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };
```

All actions must authenticate the current user, validate inputs, authorize the exact venue organization or related team/league resource, mutate through the shared database client, and revalidate affected routes.

## Venue Organization and Profile Actions

### createVenueOrganization(input)

**Purpose**: Create a rink/venue organization and first draft venue profile.

**Input**:

- organizationName
- organizationType
- primaryContactName
- primaryContactEmail
- primaryContactPhone optional
- venueName
- venueType
- address fields optional until publication

**Success Data**:

- organizationId
- venueId
- profileStatus

**Authorization**: Authenticated user becomes owner.

**Revalidation**: Venue admin dashboard and venue list.

### updateVenueProfile(input)

**Purpose**: Update public and administrative profile fields.

**Input**:

- venueId
- name
- publicDescription
- address fields
- timezone
- public contact fields
- amenities
- policies
- brand colors
- logo reference
- private manager notes

**Success Data**:

- venueId
- profileStatus
- updatedAt

**Authorization**: Venue owner or manager.

**Revalidation**: Public venue profile, venue admin profile, venue list.

### publishVenueProfile(input)

**Purpose**: Move a complete draft/unpublished profile to published.

**Input**:

- venueId

**Success Data**:

- venueId
- profileStatus
- publishedAt

**Failure Cases**:

- Missing required public fields
- User lacks venue publish permission
- Slug collision

## Staff Actions

### inviteVenueStaff(input)

**Purpose**: Invite or assign staff to a venue organization.

**Input**:

- organizationId
- venueId optional
- email
- role

**Success Data**:

- staffId
- status

**Authorization**: Owner or manager with staff-management permission.

### updateVenueStaffRole(input)

**Purpose**: Change staff role or scope.

**Input**:

- staffId
- role
- venueId optional
- status

**Success Data**:

- staffId
- role
- status

**Failure Cases**:

- Would remove the last active owner
- User lacks staff-management permission

## Surface and Schedule Actions

### createIceSurface(input)

**Purpose**: Add a bookable surface or activity area.

**Input**:

- venueId
- name
- surfaceType
- capacity optional
- isDefault
- displayOrder optional

**Success Data**:

- surfaceId
- venueId

**Authorization**: Venue owner, manager, or scheduler.

### setOperatingHours(input)

**Purpose**: Define standard or exception operating hours.

**Input**:

- venueId
- surfaceId optional
- dayOfWeek
- opensAt
- closesAt
- effective date range
- status
- label optional

**Success Data**:

- operatingHourId

**Failure Cases**:

- Invalid time range
- Conflicting operating-hour rule for same venue/surface/day/date range

### createScheduleBlock(input)

**Purpose**: Create recurring or one-time program, closure, lesson, event, or available ice block.

**Input**:

- venueId
- surfaceId optional
- title
- description optional
- activityType
- audience
- visibility
- startsAt
- endsAt
- recurrence details optional
- capacity optional
- price fields optional
- registrationMode
- externalRegistrationUrl optional

**Success Data**:

- scheduleBlockId
- status

**Failure Cases**:

- Schedule conflict
- Invalid recurrence
- Missing publication fields

### publishScheduleBlock(input)

**Purpose**: Publish a draft schedule block after validation.

**Input**:

- scheduleBlockId
- overrideConflict optional

**Success Data**:

- scheduleBlockId
- status

## Request Actions

### submitIceTimeRequest(input)

**Purpose**: Request a published available ice-time block.

**Input**:

- scheduleBlockId
- requesterTeamId optional
- requesterLeagueId optional
- organizationName optional
- contactName
- contactEmail
- contactPhone optional
- notes optional

**Success Data**:

- requestId
- status

**Authorization**: Authenticated requester; team/league IDs require admin/member authority as appropriate.

### decideIceTimeRequest(input)

**Purpose**: Accept, decline, or mark a request under review.

**Input**:

- requestId
- decision: under review, accepted, declined
- message optional

**Success Data**:

- requestId
- status
- decidedAt

**Authorization**: Venue owner, manager, scheduler, or request manager.

## Content and Lesson Actions

### createLessonOffering(input)

**Purpose**: Create or update public/private lesson offerings.

**Input**:

- venueId
- title
- lessonType
- description
- instructorName optional
- price fields optional
- availabilityDescription or scheduleBlockIds
- skillLevelIds optional
- registrationMode
- status

**Success Data**:

- lessonOfferingId
- status

### publishVenuePost(input)

**Purpose**: Publish, schedule, unpublish, or archive venue content.

**Input**:

- venueId
- postId optional
- title
- slug optional
- excerpt optional
- body
- status
- scheduledFor optional

**Success Data**:

- postId
- status
- publishedAt optional

## Relationship Actions

### inviteVenueRelationship(input)

**Purpose**: Invite a team, league, coach, or organization to designate preferred/home venue status.

**Input**:

- venueId
- relationshipType
- targetType
- teamId optional
- leagueId optional
- targetName optional
- invitedEmail optional
- expiresAt optional

**Success Data**:

- relationshipId
- status

**Authorization**: Venue owner or manager.

### respondToVenueRelationship(input)

**Purpose**: Accept or reject a preferred/home venue invitation.

**Input**:

- relationshipId
- response: accept or reject

**Success Data**:

- relationshipId
- status

**Authorization**: Authorized admin for target team, league, coach, or organization.
