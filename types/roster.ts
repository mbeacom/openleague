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

// Division type (for filtering/organization)
export type Division = {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
};
