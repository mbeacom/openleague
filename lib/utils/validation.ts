import { z } from "zod";

// Helper to sanitize string input by trimming and removing dangerous characters
function sanitizedString(maxLength: number = 255) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((str) => {
      // Remove null bytes and other control characters that could be dangerous
      return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    });
}

// Helper for sanitized strings with minimum length
function sanitizedStringWithMin(minLength: number, maxLength: number = 255) {
  return z
    .string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .transform((str) => {
      // Remove null bytes and other control characters that could be dangerous
      return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    });
}

// Helper for sanitized optional strings
function optionalSanitizedString(maxLength: number = 255) {
  return sanitizedString(maxLength).optional().or(z.literal(""));
}

// Auth validation schemas
export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"), // RFC 5321 limit
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"), // Reasonable limit for bcrypt
  name: optionalSanitizedString(100),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  password: z.string().min(1, "Password is required").max(128),
});

// Team validation schemas
export const createTeamSchema = z.object({
  name: sanitizedStringWithMin(1, 100).refine(val => val.length > 0, "Team name is required"),
  sport: sanitizedStringWithMin(1, 50).refine(val => val.length > 0, "Sport is required"),
  season: sanitizedStringWithMin(1, 50).refine(val => val.length > 0, "Season is required"),
});

// Player validation schemas
export const addPlayerSchema = z.object({
  name: sanitizedStringWithMin(1, 100).refine(val => val.length > 0, "Name is required"),
  email: optionalSanitizedString(254)
    .refine((val) => !val || z.string().email().safeParse(val).success, {
      message: "Invalid email address",
    }),
  phone: optionalSanitizedString(20),
  emergencyContact: optionalSanitizedString(100),
  emergencyPhone: optionalSanitizedString(20),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const updatePlayerSchema = addPlayerSchema.extend({
  id: z.string().min(1, "Player ID is required"),
});

// Event validation schemas
const baseEventSchema = z.object({
  type: z.enum(["GAME", "PRACTICE"], {
    message: "Event type must be GAME or PRACTICE",
  }),
  title: sanitizedStringWithMin(1, 100).refine(val => val.length > 0, "Title is required"),
  startAt: z.coerce.date({
    message: "Valid date and time is required",
  }),
  location: sanitizedStringWithMin(1, 200).refine(val => val.length > 0, "Location is required"),
  opponent: optionalSanitizedString(100),
  notes: optionalSanitizedString(1000),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const createEventSchema = baseEventSchema
  .refine(
    (data) => {
      // Validate date is not in the past
      return data.startAt > new Date();
    },
    {
      message: "Event date must be in the future",
      path: ["startAt"],
    }
  )
  .refine(
    (data) => {
      // Require opponent field for GAME type
      if (data.type === "GAME") {
        return data.opponent && data.opponent.trim().length > 0;
      }
      return true;
    },
    {
      message: "Opponent is required for games",
      path: ["opponent"],
    }
  );

export const updateEventSchema = baseEventSchema
  .extend({
    id: z.string().cuid("Invalid event ID format"),
  })
  .refine(
    (data) => {
      // Validate date is not in the past
      return data.startAt > new Date();
    },
    {
      message: "Event date must be in the future",
      path: ["startAt"],
    }
  )
  .refine(
    (data) => {
      // Require opponent field for GAME type
      if (data.type === "GAME") {
        return data.opponent && data.opponent.trim().length > 0;
      }
      return true;
    },
    {
      message: "Opponent is required for games",
      path: ["opponent"],
    }
  );

// RSVP validation schemas
export const updateRSVPSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  status: z.enum(["GOING", "NOT_GOING", "MAYBE"], {
    message: "RSVP status must be GOING, NOT_GOING, or MAYBE",
  }),
});

// Invitation validation schemas
export const sendInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const sendLeagueInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  teamId: z.string().cuid("Invalid team ID format"),
  leagueId: z.string().cuid("Invalid league ID format"),
});

// League validation schemas
export const createLeagueSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  sport: sanitizedStringWithMin(1, 50),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  contactPhone: optionalSanitizedString(20),
});

export const updateLeagueSettingsSchema = z.object({
  id: z.string().cuid("Invalid league ID format"),
  name: sanitizedStringWithMin(1, 100),
  sport: sanitizedStringWithMin(1, 50),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  contactPhone: optionalSanitizedString(20),
});

export const addTeamToLeagueSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  name: sanitizedStringWithMin(1, 100),
  sport: sanitizedStringWithMin(1, 50),
  season: sanitizedStringWithMin(1, 50),
  divisionId: z.string().cuid("Invalid division ID format").optional(),
});

export const migrateTeamToLeagueSchema = z.object({
  teamId: z.string().cuid("Invalid team ID format"),
  leagueData: createLeagueSchema,
});

// Division validation schemas
export const createDivisionSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  name: sanitizedStringWithMin(1, 100),
  ageGroup: optionalSanitizedString(50),
  skillLevel: optionalSanitizedString(50),
});

export const updateDivisionSchema = z.object({
  id: z.string().cuid("Invalid division ID format"),
  leagueId: z.string().cuid("Invalid league ID format"),
  name: sanitizedStringWithMin(1, 100),
  ageGroup: optionalSanitizedString(50),
  skillLevel: optionalSanitizedString(50),
});

export const deleteDivisionSchema = z.object({
  id: z.string().cuid("Invalid division ID format"),
  leagueId: z.string().cuid("Invalid league ID format"),
});

export const assignTeamToDivisionSchema = z.object({
  teamId: z.string().cuid("Invalid team ID format"),
  divisionId: z.string().cuid("Invalid division ID format").nullable(),
  leagueId: z.string().cuid("Invalid league ID format"),
});

// Player transfer validation schema
export const transferPlayerSchema = z.object({
  playerId: z.string().cuid("Invalid player ID format"),
  fromTeamId: z.string().cuid("Invalid from team ID format"),
  toTeamId: z.string().cuid("Invalid to team ID format"),
  leagueId: z.string().cuid("Invalid league ID format"),
});

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sport: z.string().optional(),
  season: z.string().optional(),
  divisionId: z.string().cuid().optional().nullable(),
});

export const getLeagueTeamsSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sport: z.string().optional(),
  season: z.string().optional(),
  divisionId: z.string().cuid().optional().nullable(),
});

// Type exports
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type AddPlayerInput = z.infer<typeof addPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateRSVPInput = z.infer<typeof updateRSVPSchema>;
export type SendInvitationInput = z.infer<typeof sendInvitationSchema>;
export type SendLeagueInvitationInput = z.infer<typeof sendLeagueInvitationSchema>;
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type UpdateLeagueSettingsInput = z.infer<typeof updateLeagueSettingsSchema>;
export type AddTeamToLeagueInput = z.infer<typeof addTeamToLeagueSchema>;
export type MigrateTeamToLeagueInput = z.infer<typeof migrateTeamToLeagueSchema>;
export type CreateDivisionInput = z.infer<typeof createDivisionSchema>;
export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;
export type DeleteDivisionInput = z.infer<typeof deleteDivisionSchema>;
export type AssignTeamToDivisionInput = z.infer<typeof assignTeamToDivisionSchema>;
export type TransferPlayerInput = z.infer<typeof transferPlayerSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type GetLeagueTeamsInput = z.infer<typeof getLeagueTeamsSchema>;
