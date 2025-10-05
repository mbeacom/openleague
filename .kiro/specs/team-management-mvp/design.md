# Design Document

## Overview

The openleague MVP is a Next.js 14+ application using the App Router architecture, built with TypeScript, React 19, and MUI v7 for the UI layer. The application follows a modern full-stack architecture where the frontend and backend coexist within the same Next.js project, leveraging Server Actions for mutations and API routes for complex operations.

The system is designed with a mobile-first approach, ensuring responsive layouts across all screen sizes. Authentication is handled via Auth.js (NextAuth.js), and data persistence uses Prisma ORM with PostgreSQL hosted on Neon (with potential future migration to AWS RDS). The application is optimized for deployment on Vercel.

**Data Fetching Strategy:** The application primarily uses React Server Components for data fetching, which eliminates the need for client-side data fetching libraries in most cases. TanStack Query is only used sparingly for Client Components that require client-side caching, real-time updates, or optimistic mutations (e.g., RSVP buttons). Most pages fetch data directly in Server Components and pass it as props to Client Components.

## Theming & Branding

### MVP Theme

## Theming & Branding

### MVP Theme

**Color Palette**: See [COLOR_PALETTE.md](./COLOR_PALETTE.md) for complete color definitions, usage guidelines, and accessibility standards.

**Summary**:
- **Primary**: Deep Blue (#1976D2) - trust, professionalism, sports
- **Secondary**: Vibrant Green (#43A047) - energy, action, "go"
- **Semantic Colors**: Red (error/"not going"), Amber (warning/"maybe"), Green (success)
- **All colors meet WCAG AA accessibility standards**

**Rationale**:
- **Blue Primary**: Conveys trust, professionalism, and is universally associated with sports (many team colors)
- **Green Secondary**: Represents action, energy, and positive responses ("Going" RSVP)
- **High Contrast**: All colors meet WCAG AA standards for accessibility
- **Sports-Friendly**: Blue/green combination is common in sports branding and feels energetic
- **Semantic Colors**: Warning (amber) for "Maybe", Error (red) for "Not Going", Success (green) for confirmations
- **Material Design**: Uses Material Design color system for consistency and proven accessibility

**Typography:**
- Font Family: 'Roboto', sans-serif (MUI default, excellent readability)
- Headings: 500-700 weight
- Body: 400 weight
- Mobile-optimized sizing with responsive breakpoints

**Additional Theme Settings:**
- Mobile-first responsive breakpoints (xs: <600px, sm: 600-960px, md: >960px)
- Minimum 44x44px touch targets
- 8px spacing unit for consistent layouts
- Border radius: 4px (subtle, professional)
- Elevation/shadows: Material Design standard
- Design theme system with extensibility in mind for future per-organization customization

### Future Customization (Post-MVP)
- **Per-Organization Theming**: Each league/org/team can customize colors, logo, layout
- **Logo-Based Color Extraction**: Auto-generate theme from uploaded logo (analyze logo colors and generate complementary palette)
- **Layout Customization**: Allow reordering/hiding page sections (inspired by Crossbar competitor)
- **Component Placement**: Drag-and-drop page builder for team pages
- **Custom Branding**: Upload logos, set primary/secondary colors, customize fonts

**Design Consideration**: Build the theme system with a flexible architecture that allows easy extension to per-organization theming without major refactoring.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Client Browser]
    NextJS[Next.js App Router]
    ServerActions[Server Actions]
    API[API Routes]
    Auth[Auth.js]
    Prisma[Prisma ORM]
    DB[(PostgreSQL)]
    Email[Email Service]

    Client -->|HTTP/HTTPS| NextJS
    NextJS --> ServerActions
    NextJS --> API
    NextJS --> Auth
    ServerActions --> Prisma
    API --> Prisma
    Auth --> Prisma
    Prisma --> DB
    ServerActions --> Email
    API --> Email
```

### Technology Stack

- **Frontend**: React 19, MUI v7, Emotion for styling
- **Backend**: Next.js Server Actions, API Routes, React Server Components
- **Database**: Neon (serverless PostgreSQL) via Prisma ORM (may transition to AWS RDS in future)
- **Authentication**: Auth.js with credentials provider
- **Email**: Mailchimp Transactional Email (may transition to AWS SES in future)
- **Deployment**: Vercel
- **Package Manager**: Bun
- **Client State** (minimal): TanStack Query only for specific Client Components requiring optimistic updates

### Directory Structure

```
openleague/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── roster/
│   │   │   └── page.tsx
│   │   ├── calendar/
│   │   │   └── page.tsx
│   │   └── events/
│   │       ├── [id]/
│   │       │   └── page.tsx
│   │       └── new/
│   │           └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   └── invitations/
│   │       └── [token]/
│   │           └── route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── Dialog.tsx
│   └── features/
│       ├── auth/
│       │   ├── LoginForm.tsx
│       │   └── SignupForm.tsx
│       ├── roster/
│       │   ├── RosterList.tsx
│       │   ├── PlayerCard.tsx
│       │   └── AddPlayerDialog.tsx
│       ├── calendar/
│       │   ├── CalendarView.tsx
│       │   ├── EventCard.tsx
│       │   └── EventList.tsx
│       └── events/
│           ├── EventForm.tsx
│           ├── RSVPButtons.tsx
│           └── AttendanceView.tsx
├── lib/
│   ├── db/
│   │   └── prisma.ts
│   ├── auth/
│   │   ├── config.ts
│   │   └── session.ts
│   ├── email/
│   │   ├── client.ts
│   │   └── templates.ts
│   ├── actions/
│   │   ├── team.ts
│   │   ├── roster.ts
│   │   ├── events.ts
│   │   └── rsvp.ts
│   └── utils/
│       ├── validation.ts
│       └── date.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── types/
│   ├── auth.ts
│   ├── team.ts
│   └── event.ts
└── public/
    └── images/
```

## Components and Interfaces

### Authentication Layer

**Auth.js Configuration**
- Credentials provider for email/password authentication
- Session strategy: JWT for stateless authentication
- Password hashing using bcrypt
- Session persistence with secure HTTP-only cookies

**Key Components:**
- `LoginForm`: Email/password input with validation
- `SignupForm`: Registration with email, password, and confirmation
- `AuthGuard`: HOC to protect routes requiring authentication

### Team Management

**Team Creation Flow:**
1. User submits team creation form (Server Action)
2. System creates team record with Admin role assignment
3. User redirected to team dashboard

**Key Components:**
- `CreateTeamForm`: Form for team name, sport, season
- `TeamDashboard`: Overview of team with quick actions
- `TeamSelector`: Dropdown for users with multiple teams (future)

### Roster Management

**Data Flow:**
1. Admin adds/edits player via form (Client Component)
2. Server Action validates and persists to database
3. Page revalidates and re-renders with updated data (Server Component)
4. Email invitation sent if player doesn't have account

Note: For instant feedback, the form can use optimistic updates via useOptimistic hook or TanStack Query mutation.

**Key Components:**
- `RosterList`: Responsive list/grid of players
- `PlayerCard`: Display player info with edit/delete actions (admin only)
- `AddPlayerDialog`: Modal form for adding players
- `InvitationManager`: View and manage pending invitations

### Scheduling System

**Event Creation Flow:**
1. Admin fills event form (type, start date/time, location, opponent, notes)
2. Server Action validates and creates event (startAt stored as DateTime in UTC)
3. Background job sends email notifications to all team members
4. Calendar view updates with new event

**Key Components:**
- `EventForm`: Dynamic form that adjusts based on event type
- `CalendarView`: Desktop calendar grid, mobile list view
- `EventCard`: Display event details with RSVP buttons
- `EventDetailView`: Full event information with attendance

### RSVP System

**RSVP Flow:**
1. Member clicks RSVP button (Going/Not Going/Maybe) in Client Component
2. Server Action updates RSVP record
3. UI updates immediately using optimistic update (useOptimistic or TanStack Query)
4. Admin's attendance view reflects change on next render

Note: RSVP buttons are one of the few places where TanStack Query provides value for instant feedback and optimistic updates.

**Key Components:**
- `RSVPButtons`: Three-button group for status selection
- `AttendanceView`: Admin view showing all responses
- `AttendanceSummary`: Count of Going/Not Going/Maybe/No Response

### Email Notification System

**Email Types:**
- Welcome email (signup)
- Team invitation
- Event created/updated/cancelled
- RSVP reminder (48 hours before event)

**Implementation:**
- Template-based emails with dynamic content
- Queue system for batch sending (future optimization)
- Unsubscribe link in all emails (future feature)

## Data Models

### Prisma Schema

```prisma
// User model
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  teamMembers   TeamMember[]
  rsvps         RSVP[]
  invitations   Invitation[]
}

// Team model
model Team {
  id          String    @id @default(cuid())
  name        String
  sport       String
  season      String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  members     TeamMember[]
  events      Event[]
  invitations Invitation[]
}

// TeamMember junction table with role
model TeamMember {
  id        String   @id @default(cuid())
  role      Role     @default(MEMBER)
  joinedAt  DateTime @default(now())

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
}

enum Role {
  ADMIN
  MEMBER
}

// Player model (roster information)
// NOTE: Player represents roster entries for team members who may or may not have user accounts.
// - Players can exist without User accounts (e.g., youth players whose parents manage RSVPs)
// - When a Player accepts an invitation and creates an account, they become linked via TeamMember
// - TeamMember connects authenticated Users to Teams with roles (ADMIN/MEMBER)
// - A single person can exist as both a Player (roster entry) and have a User account (TeamMember)
// - In MVP: Keep Player for roster display, use TeamMember.userId for RSVP and auth operations
model Player {
  id                String   @id @default(cuid())
  name              String
  email             String?
  phone             String?
  emergencyContact  String?  // Admin-only field, not visible to regular members
  emergencyPhone    String?  // Admin-only field, not visible to regular members
  userId            String?  // Optional link to User account if player has registered
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  teamId            String
  team              Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
}

// Event model
model Event {
  id          String      @id @default(cuid())
  type        EventType
  title       String
  startAt     DateTime    // Combined date and time stored in UTC for proper timezone handling
  location    String
  opponent    String?
  notes       String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  teamId      String
  team        Team        @relation(fields: [teamId], references: [id], onDelete: Cascade)

  rsvps       RSVP[]
}

enum EventType {
  GAME
  PRACTICE
}

// RSVP model
model RSVP {
  id          String      @id @default(cuid())
  status      RSVPStatus  @default(NO_RESPONSE)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  eventId     String
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([userId, eventId])
}

enum RSVPStatus {
  GOING
  NOT_GOING
  MAYBE
  NO_RESPONSE
}

// Invitation model
model Invitation {
  id          String           @id @default(cuid())
  email       String
  token       String           @unique
  status      InvitationStatus @default(PENDING)
  expiresAt   DateTime
  createdAt   DateTime         @default(now())

  teamId      String
  team        Team             @relation(fields: [teamId], references: [id], onDelete: Cascade)

  invitedById String
  invitedBy   User             @relation(fields: [invitedById], references: [id])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
}
```

### Key Relationships

- User ↔ Team: Many-to-many through TeamMember (with role)
- Team → Player: One-to-many (roster)
- Team → Event: One-to-many (schedule)
- User ↔ Event: Many-to-many through RSVP (with status)
- Team → Invitation: One-to-many (pending invites)

## Error Handling

### Client-Side Error Handling

**Form Validation:**
- Real-time validation using Zod schemas
- Display inline error messages below fields
- Disable submit button until form is valid

**Network Errors:**
- Display toast notifications for failed requests
- Retry mechanism for transient failures
- Fallback UI for offline state

**Error Boundaries:**
- React Error Boundaries at route level
- Graceful degradation with error message and retry button
- Log errors to monitoring service (future: Sentry)

### Server-Side Error Handling

**Server Actions:**
```typescript
// Example error handling pattern
export async function createEvent(data: EventInput) {
  try {
    // Validate input
    const validated = eventSchema.parse(data);

    // Check authorization
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Perform database operation
    const event = await prisma.event.create({
      data: validated
    });

    // Send notifications
    await sendEventNotifications(event);

    return { success: true, data: event };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Invalid input', details: error.errors };
    }
    if (error instanceof PrismaClientKnownRequestError) {
      return { error: 'Database error' };
    }
    return { error: 'An unexpected error occurred' };
  }
}
```

**API Routes:**
- Return appropriate HTTP status codes
- Consistent error response format: `{ error: string, details?: any }`
- Log errors with context for debugging

### Database Error Handling

- Unique constraint violations: Return user-friendly messages
- Foreign key violations: Prevent orphaned records
- Connection errors: Retry with exponential backoff
- Transaction rollback on failure

## Testing Strategy

### Unit Testing

**Tools:** Vitest, React Testing Library

**Coverage:**
- Utility functions (validation, date formatting)
- Server Actions (mocked database)
- React components (isolated rendering)
- Email template generation

**Example Test:**
```typescript
describe('createEvent', () => {
  it('should create event with valid data', async () => {
    const result = await createEvent({
      type: 'GAME',
      title: 'vs Rivals',
      date: new Date('2025-10-15'),
      time: '18:00',
      location: 'Home Field',
      opponent: 'Rivals FC',
      teamId: 'team-123'
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id');
  });

  it('should reject past dates', async () => {
    const result = await createEvent({
      type: 'GAME',
      date: new Date('2020-01-01'),
      // ... other fields
    });

    expect(result.error).toBe('Invalid input');
  });
});
```

### Integration Testing

**Tools:** Playwright

**Coverage:**
- Complete user flows (signup → create team → add event → RSVP)
- Authentication flows
- Form submissions with validation
- Mobile responsive behavior

**Example Test:**
```typescript
test('admin can create event and member can RSVP', async ({ page }) => {
  // Admin creates event
  await page.goto('/login');
  await page.fill('[name="email"]', 'admin@test.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.goto('/events/new');
  await page.fill('[name="title"]', 'Practice');
  // ... fill other fields
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Practice')).toBeVisible();

  // Member RSVPs
  await page.goto('/logout');
  await page.goto('/login');
  await page.fill('[name="email"]', 'member@test.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.goto('/calendar');
  await page.click('text=Practice');
  await page.click('button:has-text("Going")');

  await expect(page.locator('button:has-text("Going")')).toHaveClass(/selected/);
});
```

### Manual Testing Checklist

**Mobile Testing:**
- [ ] Test on iOS Safari (iPhone 12+)
- [ ] Test on Android Chrome (Pixel 5+)
- [ ] Verify touch targets are 44x44px minimum
- [ ] Test landscape and portrait orientations
- [ ] Verify forms work with mobile keyboards

**Cross-Browser Testing:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Accessibility Testing:**
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces all interactive elements
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus indicators are visible

## Security Considerations

### Authentication Security

- Passwords hashed with bcrypt (cost factor: 12)
- JWT tokens with short expiration (7 days)
- HTTP-only cookies to prevent XSS
- CSRF protection via Auth.js

### Authorization

- Server-side permission checks on all mutations
- Row-level security: Users can only access their teams
- Admin-only actions verified on server
- API routes validate session before processing

### Data Protection

- HTTPS enforced in production
- Environment variables for secrets (never committed)
- Parameterized queries via Prisma (SQL injection prevention)
- Input validation with Zod schemas
- Rate limiting on API routes (future: Vercel rate limiting)

### Email Security

- Invitation tokens: Cryptographically random, single-use
- Token expiration: 7 days
- Email verification for sensitive actions (future)

## Performance Optimization

### Frontend Performance

- Server Components by default (reduce client JS)
- Client Components only when interactivity needed
- Image optimization with Next.js Image component
- Code splitting at route level
- Lazy loading for modals and dialogs

### Backend Performance

- Database indexes on frequently queried fields (email, teamId, eventId)
- Connection pooling via Prisma
- Caching with React Server Components
- Optimistic updates for instant UI feedback

### Mobile Performance

- Minimize bundle size (tree shaking, no unused MUI components)
- Compress images and assets
- Prefetch critical routes
- Service worker for offline support (future)

## Deployment Strategy

### Environment Setup

**Development:**
- Neon development branch (free tier with branching support)
- `.env.local` with development credentials
- Hot reload with Next.js dev server
- Prisma Studio for database inspection

**Environment Variables (.env.local):**
```bash
# Database (Neon)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Email Service (Mailchimp Transactional)
MAILCHIMP_API_KEY="your-mailchimp-transactional-api-key"
EMAIL_FROM="noreply@openleague.app"

# Optional: For future AWS migration
# AWS_REGION="us-east-1"
# AWS_ACCESS_KEY_ID="your-access-key"
# AWS_SECRET_ACCESS_KEY="your-secret-key"
```

**Staging:**
- Vercel preview deployments on PR
- Neon preview branch (automatically created per PR)
- Mailchimp test mode or sandbox

**Production:**
- Vercel production deployment
- Neon production database (serverless, auto-scaling)
- Mailchimp Transactional Email (production API key)
- Environment variables via Vercel dashboard

**Technology Choices:**
- **Neon**: Serverless PostgreSQL with database branching, optimized for Vercel, generous free tier (may migrate to AWS RDS in future)
- **Mailchimp Transactional**: Existing account, proven deliverability (may migrate to AWS SES in future)

### CI/CD Pipeline

1. Push to GitHub
2. Vercel builds and runs type checking
3. Run unit tests (Vitest)
4. Deploy preview (on PR) or production (on main)
5. Run smoke tests against deployment

### Monitoring

- Vercel Analytics for performance metrics
- Error tracking (future: Sentry)
- Database monitoring via Supabase/Neon dashboard
- Email delivery tracking

## Mobile-First Design Principles

### Responsive Breakpoints

- Mobile: < 600px (MUI xs)
- Tablet: 600px - 960px (MUI sm/md)
- Desktop: > 960px (MUI lg+)

### Mobile Optimizations

**Navigation:**
- Bottom navigation bar on mobile
- Hamburger menu for secondary actions
- Swipe gestures for calendar navigation

**Forms:**
- Single-column layouts
- Large touch targets (48px minimum)
- Appropriate input types (email, tel, date)
- Floating labels to save space

**Lists and Tables:**
- Card-based layouts on mobile
- Swipe actions for edit/delete
- Infinite scroll or pagination

**Calendar:**
- List view on mobile (chronological)
- Grid view on desktop (traditional calendar)
- Pull-to-refresh on mobile

### Touch Interactions

- Tap: Primary action (select, navigate)
- Long press: Secondary actions (edit, delete)
- Swipe: Navigation or reveal actions
- Pinch: Zoom (future: calendar zoom)

## Future Considerations

### Scalability

- Multi-team support per user
- League-level views and management
- Public team pages
- Advanced statistics tracking

### Features

- In-app messaging
- Payment processing for registration
- File attachments (photos, documents)
- Push notifications (PWA)

### Technical Debt

- Implement comprehensive error logging
- Add rate limiting
- Implement email queue system
- Add database backup strategy
- Implement feature flags for gradual rollouts
