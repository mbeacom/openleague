# Prisma Database Schema

This directory contains the Prisma schema and database migrations.

## Files

- `schema.prisma` - Database schema definition with all models
- `migrations/` - Database migration history (created after first migration)

## Database Models

### Core Models

1. **User** - User accounts with authentication
2. **Team** - Sports teams with season information
3. **TeamMember** - Junction table linking users to teams with roles (ADMIN/MEMBER)
4. **Player** - Roster entries with contact and emergency information
5. **Event** - Games and practices with scheduling details
6. **RSVP** - Availability tracking for events
7. **Invitation** - Email invitations to join teams

### Relationships

- User ↔ Team: Many-to-many through TeamMember (with role)
- Team → Player: One-to-many (roster)
- Team → Event: One-to-many (schedule)
- User ↔ Event: Many-to-many through RSVP (with status)
- Team → Invitation: One-to-many (pending invites)

### Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ TeamMember : "has memberships"
    User ||--o{ RSVP : "creates"
    User ||--o{ Invitation : "sends"

    Team ||--o{ TeamMember : "has members"
    Team ||--o{ Player : "has roster"
    Team ||--o{ Event : "schedules"
    Team ||--o{ Invitation : "receives"

    Event ||--o{ RSVP : "tracks attendance"

    User {
        string id PK
        string email UK
        string passwordHash
        string name
        datetime createdAt
        datetime updatedAt
    }

    Team {
        string id PK
        string name
        string sport
        string season
        datetime createdAt
        datetime updatedAt
    }

    TeamMember {
        string id PK
        Role role "ADMIN or MEMBER"
        datetime joinedAt
        string userId FK
        string teamId FK
    }

    Player {
        string id PK
        string name
        string email
        string phone
        string emergencyContact "Admin-only"
        string emergencyPhone "Admin-only"
        string userId "Optional link"
        string teamId FK
        datetime createdAt
        datetime updatedAt
    }

    Event {
        string id PK
        EventType type "GAME or PRACTICE"
        string title
        datetime startAt "UTC timestamp"
        string location
        string opponent "Required for GAME"
        string notes
        string teamId FK
        datetime createdAt
        datetime updatedAt
    }

    RSVP {
        string id PK
        RSVPStatus status "GOING, NOT_GOING, MAYBE, NO_RESPONSE"
        string userId FK
        string eventId FK
        datetime createdAt
        datetime updatedAt
    }

    Invitation {
        string id PK
        string email
        string token UK
        InvitationStatus status "PENDING, ACCEPTED, EXPIRED"
        datetime expiresAt
        string teamId FK
        string invitedById FK
        datetime createdAt
    }
```

**Legend:**

- `PK` = Primary Key
- `FK` = Foreign Key
- `UK` = Unique Key
- `||--o{` = One-to-many relationship
- All foreign key relationships have `ON DELETE CASCADE` except `Invitation.invitedById` which uses `RESTRICT`

## Running Migrations

### First Time Setup

After configuring your DATABASE_URL in `.env.local`:

```bash
bunx prisma migrate dev --name init
```

This creates the initial database schema and generates the Prisma Client.

### Creating New Migrations

When you modify `schema.prisma`:

```bash
bunx prisma migrate dev --name descriptive_name
```

### Applying Migrations in Production

```bash
bunx prisma migrate deploy
```

### Reset Database (Development Only)

⚠️ This will delete all data:

```bash
bunx prisma migrate reset
```

## Prisma Studio

View and edit your database visually:

```bash
bunx prisma studio
```

Opens at [http://localhost:5555](http://localhost:5555)

## Generating Prisma Client

The Prisma Client is automatically generated when you run migrations. To manually regenerate:

```bash
bunx prisma generate
```

## Schema Validation

Check if your schema is valid:

```bash
bunx prisma validate
```

Format your schema:

```bash
bunx prisma format
```
