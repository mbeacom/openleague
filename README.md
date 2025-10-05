# openleague

A free platform for managing sports teams, leagues, and clubs. Simplify your season with tools for rostering, scheduling, and communication.

## High-Level Overview

### Stack

- React 19+
- MUI v7+
- Node.js 22+
- Bun

### MVP Scope: The "Single Team, Single Source of Truth"

The MVP's core mission is to replace the chaotic spreadsheet, group chat, and email chains that a typical team manager struggles with. It should be the one place they go to answer "Who, What, When, and Where?"

Core Features (The "Must-Haves"):

1. User & Team Foundation

    User Authentication: Simple email/password registration and login.

    Team Creation: An authenticated user (the "Admin") can create a team for a specific season (e.g., "U12 Wildcats 2025-2026").

    Simple Roles: Only two roles to start: Admin (can manage everything) and Member (can view and set their availability).

2. Roster Management

    Invite Members: Admin can send email invitations to players/parents to join the team.

    Basic Roster: A simple list of team members (player name, jersey number, parent/guardian contact info). Admins can add/edit/remove members.

3. Scheduling & Calendar

    Event Creation: Admin can create two types of events: Game or Practice.

    Event Details: Events must include:

        Event Type (Game/Practice)

        Date & Time

        Location (simple text field, maybe a Google Maps link)

        Opponent (for games)

        Notes

    Team Calendar: A simple list or calendar view showing all upcoming events for the team.

4. Availability Tracking

    RSVP System: For each event, invited Members can mark their availability: Going, Not Going, or Maybe.

    Attendance View: The Admin can click on an event and see a simple list of who has responded and what their status is. This is the killer feature that solves a huge pain point.

Key Focus for MVP:

    Admin-First Experience: The entire MVP should be built from the perspective of making the team manager's life easier.

    No Frills: The UI should be clean, fast, and functional. Avoid complex animations or visual clutter.

    Responsive Web: The application must work seamlessly on a mobile browser, as most parents and coaches will use it on their phones.

What to Exclude (Post-MVP Features):

    Payments & Registration: This adds huge complexity. Avoid it for now.

    Multi-Team/League-Level Views: Focus on making it perfect for a single team first.

    Stats Tracking: No goals, assists, save percentages, etc. Just event scheduling.

    Public-Facing Websites: The MVP is for logged-in users only.

    In-App Chat/Messaging: Use email notifications for invites and announcements. Don't build a chat system.

### Recommended MVP Tech Stack

Your initial thoughts are excellent. This stack is modern, highly productive, and perfect for a solo developer or small team.

Frontend

    Framework: Next.js 14+ (with React 19) - The best choice. App Router, Server Actions, and built-in API routes make development incredibly fast.

    Language: TypeScript - Non-negotiable for a project of this scale. It will save you countless hours of debugging.

    UI Components: MUI (Material-UI) - Since you already know it, this is a great pick. It provides a professional-looking and comprehensive set of components out of the box, letting you build the UI quickly.

    State Management & Data Fetching: TanStack Query (formerly React Query) - The industry standard for managing server state. It will handle caching, re-fetching, and loading states, dramatically simplifying your code.

Backend

    Framework: Next.js API Routes / Server Actions - For the MVP, keep your backend and frontend in the same project. It's vastly simpler to manage and deploy. Server Actions, in particular, will make your forms and data mutations very easy to write.

    Authentication: Auth.js (formerly NextAuth.js) - The definitive solution for authentication in Next.js. It's secure, easy to set up, and handles everything from email/password to social logins (which you can add later).

    Database ORM: Prisma - A modern database toolkit that pairs perfectly with TypeScript. It provides incredible type safety (your database schema generates TypeScript types) and makes database queries simple and safe.

Database

    Database: PostgreSQL - The most reliable, powerful, and scalable open-source relational database. It's a choice you will never regret.

    Hosting: Supabase or Neon. Both offer fantastic, free-tier managed PostgreSQL hosting. Supabase also offers an entire backend-as-a-service suite (including auth) which could be an alternative to Auth.js if you prefer. For a pure database, Neon is excellent.

Deployment

    Platform: Vercel - Since you're using Next.js, Vercel is the path of least resistance. It's built by the same company. Deployment is as simple as git push. Their free tier is very generous and perfect for an MVP.
