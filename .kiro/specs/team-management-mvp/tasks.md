# Implementation Plan

- [x] 1. Initialize Next.js project and configure core dependencies

  - Run `bunx create-next-app@latest openleague --typescript --app --no-tailwind`
  - Install MUI v7, Emotion, Prisma, Auth.js packages
  - Install Mailchimp Transactional Email SDK (`@mailchimp/mailchimp_transactional`)
  - Configure `next.config.js` for MUI with Emotion
  - Create `.env.local` template with required environment variables (DATABASE_URL, NEXTAUTH_SECRET, MAILCHIMP_API_KEY, etc.)
  - _Requirements: 10.1, 10.6_

- [x] 2. Set up Prisma with Neon database

  - Initialize Prisma with `bunx prisma init`
  - Configure `DATABASE_URL` in `.env.local` for Neon connection
  - Create complete Prisma schema with User, Team, TeamMember, Player, Event, RSVP, and Invitation models
  - Run initial migration to create database tables
  - Create `lib/db/prisma.ts` with singleton Prisma client instance
  - _Requirements: 10.1, 10.2_

- [ ] 3. Implement authentication foundation with Auth.js

  - [ ] 3.1 Configure Auth.js with credentials provider

    - Create `app/api/auth/[...nextauth]/route.ts` with Auth.js configuration
    - Implement credentials provider with email/password validation
    - Configure JWT session strategy with 7-day expiration
    - Set up bcrypt password hashing (cost factor 12)
    - _Requirements: 1.1, 1.2, 1.3, 10.2_

  - [ ] 3.2 Create authentication utilities and session helpers

    - Create `lib/auth/config.ts` with Auth.js options
    - Create `lib/auth/session.ts` with `getSession()` and `requireAuth()` helpers
    - Implement server-side session validation for protected routes
    - _Requirements: 1.4, 1.6, 10.7_

  - [ ] 3.3 Build signup and login pages
    - Create `app/(auth)/signup/page.tsx` with signup form
    - Create `app/(auth)/login/page.tsx` with login form
    - Implement form validation with Zod schemas
    - Add error handling and display for invalid credentials
    - Implement redirect to dashboard after successful authentication
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

- [ ] 4. Create MUI theme and base UI components

  - [ ] 4.1 Configure MUI theme with mobile-first design

    - Create `lib/theme.ts` with custom MUI theme using sports-professional color palette (Blue primary #1976D2, Green secondary #43A047)
    - Configure responsive breakpoints (xs: <600px, sm: 600-960px, md: >960px)
    - Set up Emotion cache for SSR in `app/layout.tsx`
    - Wrap app with `ThemeProvider` and `CssBaseline`
    - Ensure all colors meet WCAG AA contrast standards
    - _Requirements: 8.1, 8.2_

  - [ ] 4.2 Build reusable UI components
    - Create `components/ui/Button.tsx` with MUI Button wrapper
    - Create `components/ui/Input.tsx` with MUI TextField wrapper
    - Create `components/ui/Card.tsx` with MUI Card wrapper
    - Create `components/ui/Dialog.tsx` with MUI Dialog wrapper
    - Ensure all components have minimum 44x44px touch targets
    - _Requirements: 8.3_

- [ ] 5. Implement team creation and management

  - [ ] 5.1 Create team creation Server Action

    - Create `lib/actions/team.ts` with `createTeam` Server Action
    - Validate team name, sport, and season inputs with Zod
    - Create team record and assign creator as ADMIN role
    - Implement authorization check (user must be authenticated)
    - Return success/error response with created team data
    - _Requirements: 2.2, 2.3, 10.3_

  - [ ] 5.2 Build team creation form and dashboard

    - Create `app/(dashboard)/page.tsx` as team dashboard
    - Create `components/features/team/CreateTeamForm.tsx` with form fields
    - Implement form submission calling `createTeam` Server Action
    - Add redirect to dashboard after successful team creation
    - Display empty state if user has no teams
    - _Requirements: 2.1, 2.4_

  - [ ] 5.3 Create dashboard layout with navigation
    - Create `app/(dashboard)/layout.tsx` with navigation structure
    - Implement responsive navigation (bottom nav on mobile, sidebar on desktop)
    - Add navigation links to Roster, Calendar, and Events
    - Implement logout functionality
    - _Requirements: 2.5, 2.6, 8.4_

- [ ] 6. Build roster management system

  - [ ] 6.1 Create roster Server Actions

    - Create `lib/actions/roster.ts` with CRUD operations
    - Implement `addPlayer` Server Action with validation
    - Implement `updatePlayer` Server Action with authorization check
    - Implement `deletePlayer` Server Action with confirmation
    - Implement `getTeamRoster` function to fetch all players
    - Ensure only ADMIN role can modify roster
    - _Requirements: 3.2, 3.3, 3.4, 10.3, 10.4_

  - [ ] 6.2 Build roster list and player cards

    - Create `app/(dashboard)/roster/page.tsx` as roster page
    - Create `components/features/roster/RosterList.tsx` with responsive grid/list
    - Create `components/features/roster/PlayerCard.tsx` displaying player info
    - Implement conditional rendering: show edit/delete for ADMIN, view-only for MEMBER
    - Display emergency contacts only for ADMIN role
    - Show empty state with "Add Player" prompt when roster is empty
    - _Requirements: 3.1, 3.5, 3.6, 3.7_

  - [ ] 6.3 Create add/edit player dialog
    - Create `components/features/roster/AddPlayerDialog.tsx` with form
    - Add form fields: name, email, phone, emergency contact, emergency phone
    - Implement form validation with Zod schema
    - Call `addPlayer` or `updatePlayer` Server Action on submit
    - Display success/error feedback with toast notifications
    - _Requirements: 3.2, 3.3_

- [ ] 7. Implement invitation system

  - [ ] 7.1 Create invitation Server Actions

    - Create `lib/actions/invitations.ts` with invitation logic
    - Implement `sendInvitation` Server Action generating unique token
    - Set invitation expiration to 7 days from creation
    - Check if email already has account (add to team directly if exists)
    - Store invitation in database with PENDING status
    - _Requirements: 4.1, 4.5, 4.6_

  - [ ] 7.2 Build email invitation system

    - Create `lib/email/client.ts` with Mailchimp Transactional client configuration
    - Create `lib/email/templates.ts` with invitation email template
    - Implement `sendInvitationEmail` function with unique link
    - Include team name and inviter information in email
    - _Requirements: 4.1, 9.4_

  - [ ] 7.3 Create invitation acceptance flow

    - Create `app/api/invitations/[token]/route.ts` API route
    - Validate invitation token and check expiration
    - Redirect to signup page with pre-filled team information
    - Auto-add user to team as MEMBER after signup completion
    - Update invitation status to ACCEPTED
    - _Requirements: 4.2, 4.3_

  - [ ] 7.4 Build invitation management UI
    - Create `components/features/roster/InvitationManager.tsx`
    - Display list of pending invitations with email and status
    - Add "Resend" button for expired invitations
    - Show invitation status (pending/accepted/expired)
    - _Requirements: 4.4, 4.6_

- [ ] 8. Create event scheduling system

  - [ ] 8.1 Implement event Server Actions

    - Create `lib/actions/events.ts` with event CRUD operations
    - Implement `createEvent` Server Action with validation
    - Validate date is not in the past
    - Require opponent field for GAME type, optional for PRACTICE
    - Implement `updateEvent` and `deleteEvent` with ADMIN authorization
    - Initialize all team members with NO_RESPONSE RSVP status on event creation
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 7.6_

  - [ ] 8.2 Build event creation form

    - Create `app/(dashboard)/events/new/page.tsx` with event form
    - Create `components/features/events/EventForm.tsx` with dynamic fields
    - Add fields: type (game/practice), startAt (DateTime picker), location, opponent, notes
    - Show/hide opponent field based on event type selection
    - Implement date validation (no past dates)
    - Call `createEvent` Server Action on submit
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7_

  - [ ] 8.3 Create event detail page

    - Create `app/(dashboard)/events/[id]/page.tsx` for event details
    - Display all event information (type, startAt with timezone conversion, location, opponent, notes)
    - Show edit/delete buttons for ADMIN role only
    - Include RSVP buttons for all users
    - Display attendance summary for ADMIN
    - _Requirements: 5.3, 5.4_

  - [ ] 8.4 Implement event notification emails
    - Create email templates for event created/updated/cancelled
    - Implement `sendEventNotifications` function in `lib/email/templates.ts`
    - Send emails to all team members when event is created
    - Send update emails when event details change
    - Include event details and link to view full information
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

- [ ] 9. Build calendar view and event display

  - [ ] 9.1 Create calendar page with responsive layouts

    - Create `app/(dashboard)/calendar/page.tsx` as calendar view
    - Fetch all team events sorted by date
    - Implement responsive layout: list view on mobile, grid on desktop
    - Display events in chronological order
    - Separate upcoming and past events
    - _Requirements: 6.1, 6.4, 6.5, 6.7_

  - [ ] 9.2 Build event card component

    - Create `components/features/calendar/EventCard.tsx`
    - Display event type badge (game vs practice) with distinct colors
    - Show startAt (converted to user's local timezone), location, and opponent
    - Make cards clickable to navigate to event detail page
    - Optimize for mobile with touch-friendly sizing
    - _Requirements: 6.2, 6.3_

  - [ ] 9.3 Implement calendar list view for mobile
    - Create `components/features/calendar/EventList.tsx`
    - Display events as vertical list with cards
    - Show empty state when no events exist
    - Add pull-to-refresh functionality (future enhancement)
    - _Requirements: 6.4, 6.6_

- [ ] 10. Implement RSVP and attendance tracking

  - [ ] 10.1 Create RSVP Server Actions

    - Create `lib/actions/rsvp.ts` with RSVP operations
    - Implement `updateRSVP` Server Action accepting userId, eventId, and status
    - Validate status is one of: GOING, NOT_GOING, MAYBE
    - Create or update RSVP record in database
    - Return updated RSVP data
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 10.2 Build RSVP button component

    - Create `components/features/events/RSVPButtons.tsx` as Client Component
    - Display three buttons: Going, Not Going, Maybe
    - Highlight selected status with distinct styling
    - Call `updateRSVP` Server Action on button click
    - Implement optimistic update using useOptimistic hook
    - _Requirements: 7.1, 7.2_

  - [ ] 10.3 Create attendance view for admins

    - Create `components/features/events/AttendanceView.tsx`
    - Display summary counts: Going, Not Going, Maybe, No Response
    - Show list of members grouped by RSVP status
    - Display member names under each status category
    - Optimize for mobile with responsive layout
    - _Requirements: 7.4, 7.5_

  - [ ] 10.4 Implement RSVP reminder emails
    - Create reminder email template in `lib/email/templates.ts`
    - Implement scheduled job or cron to check events 48 hours out
    - Send reminder emails to members with NO_RESPONSE status
    - Include event details and RSVP link
    - _Requirements: 7.7, 9.5_

- [ ] 11. Add form validation and error handling

  - [ ] 11.1 Create validation schemas with Zod

    - Create `lib/utils/validation.ts` with all form schemas
    - Define schemas for: signup, login, team creation, player, event, RSVP
    - Export reusable validation functions
    - _Requirements: 1.2, 2.2, 3.2, 5.1_

  - [ ] 11.2 Implement client-side form validation

    - Add real-time validation to all forms using Zod schemas
    - Display inline error messages below form fields
    - Disable submit buttons until forms are valid
    - Show field-level errors on blur
    - _Requirements: 1.5_

  - [ ] 11.3 Add error boundaries and error handling
    - Create error boundary component at route level
    - Implement graceful error UI with retry button
    - Add toast notification system for success/error feedback
    - Handle network errors with retry mechanism
    - _Requirements: 10.5_

- [ ] 12. Implement authorization and security

  - [ ] 12.1 Add authorization checks to all Server Actions

    - Verify user session exists before processing requests
    - Check user has ADMIN role for admin-only actions
    - Verify user belongs to team before accessing team data
    - Return appropriate error messages for unauthorized access
    - _Requirements: 10.3, 10.4, 10.7_

  - [ ] 12.2 Implement HTTPS and secure headers

    - Configure `next.config.js` with security headers
    - Ensure HTTPS is enforced in production
    - Set up CSRF protection via Auth.js
    - Configure HTTP-only cookies for session tokens
    - _Requirements: 10.6_

  - [ ] 12.3 Add input sanitization and SQL injection prevention
    - Ensure all database queries use Prisma (parameterized queries)
    - Validate and sanitize all user inputs with Zod
    - Implement rate limiting on API routes (future: Vercel rate limiting)
    - _Requirements: 10.5_

- [ ] 13. Optimize for mobile and responsive design

  - [ ] 13.1 Implement responsive navigation

    - Create bottom navigation bar for mobile (<600px)
    - Create sidebar navigation for desktop (>960px)
    - Add hamburger menu for secondary actions on mobile
    - Ensure navigation is touch-friendly with 44x44px targets
    - _Requirements: 8.4_

  - [ ] 13.2 Optimize forms for mobile input

    - Use appropriate input types (email, tel, datetime-local for startAt)
    - Implement single-column layouts on mobile
    - Use floating labels to save vertical space
    - Ensure touch targets are minimum 44x44px
    - _Requirements: 8.2, 8.3_

  - [ ] 13.3 Convert tables to card layouts on mobile
    - Implement responsive roster list (grid on desktop, cards on mobile)
    - Convert calendar grid to list view on mobile
    - Add swipe gestures for actions (future enhancement)
    - _Requirements: 8.1, 8.5_

- [ ] 14. Set up deployment and environment configuration

  - [ ] 14.1 Configure Vercel deployment

    - Create `vercel.json` with build configuration
    - Set up environment variables in Vercel dashboard (DATABASE_URL, NEXTAUTH_SECRET, MAILCHIMP_API_KEY, etc.)
    - Configure Neon database connection string
    - Set up Mailchimp Transactional API key for email sending
    - _Requirements: 10.1, 10.6_

  - [ ] 14.2 Create database migration workflow

    - Document Prisma migration commands in README
    - Set up automatic migrations on deployment
    - Create seed script for development data (optional)
    - _Requirements: 10.1_

  - [ ] 14.3 Add environment variable validation
    - Create `lib/env.ts` with environment variable schema
    - Validate required environment variables on startup
    - Provide clear error messages for missing variables
    - _Requirements: 10.6_

- [ ] 15. Create documentation and README
  - Update README.md with project overview and setup instructions
  - Document environment variables required (DATABASE_URL, NEXTAUTH_SECRET, MAILCHIMP_API_KEY, etc.)
  - Add development workflow (install, migrate, run, test)
  - Include deployment instructions for Vercel
  - Document Neon database setup and connection
  - Document Mailchimp Transactional Email setup and API key configuration
  - Note future migration paths (AWS RDS for database, AWS SES for email)
  - _Requirements: All_
