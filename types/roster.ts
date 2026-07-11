/**
 * Shared type definitions for roster management
 */

import type { Prisma } from '@prisma/client';

// Base player type (minimal fields)
export type Player = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  jerseyNumber: number | null;
  position?: string | null; // Free-text position (e.g., Center, Goalie). Varies by sport.
  usahMemberId: string | null; // admin-only — must not appear in non-admin query selects
};

// Player with team and division relations (for league roster views)
export type PlayerWithTeam = Prisma.PlayerGetPayload<{
  include: {
    team: {
      select: {
        id: true;
        name: true;
        division: {
          select: {
            id: true;
            name: true;
            ageGroup: true;
            skillLevel: true;
          };
        };
      };
    };
    user: {
      select: {
        id: true;
        email: true;
      };
    };
  };
}>;

// Team with optional division info (for filtering/display)
export type TeamWithDivision = {
  id: string;
  name: string;
  divisionId?: string | null;
  division?: {
    name: string;
    ageGroup: string | null;
  } | null;
};

// Team official entry (coaches, managers, treasurers, volunteers).
// Role is descriptive taxonomy only — permissions live on TeamMember.role.
// Re-exported from the Prisma model so action results and UI props stay in sync.
export type {
  TeamOfficial,
  TeamOfficialRole,
  TeamOfficialStatus,
} from '@prisma/client';

// Guardian edge (identity graph, Tier 3): a User who manages a roster Player.
// Guardians with canRsvp answer per child via RSVP rows carrying playerId.
// Re-exported from the Prisma model so action results and UI props stay in sync.
export type { PlayerGuardian } from '@prisma/client';

// Guardian row with the linked user's display fields (guardian chips,
// manage dialogs, attendance attribution).
export type GuardianWithUser = Prisma.PlayerGuardianGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

// Team member with user info (for admin views — includes usahMemberId)
export type TeamMemberWithUser = {
  id: string;
  role: "ADMIN" | "MEMBER";
  joinedAt: Date;
  usahMemberId: string | null; // admin-only
  user: {
    id: string;
    name: string | null;
    email: string;
  };
};

// Division type (for filtering/organization)
export type Division = {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
};
