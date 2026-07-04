import { z } from "zod";
import { isValidTimeZone } from "@/lib/utils/date";

/**
 * Optional IANA timezone string (e.g. "America/New_York"). Validated against the
 * runtime's timezone database so we only ever persist zones we can format back.
 */
export const optionalTimeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => isValidTimeZone(value), "Invalid timezone")
  .optional();

// Sport enum — must match the Prisma Sport enum exactly
export const SPORTS = [
  "HOCKEY",
  "LACROSSE",
  "SOCCER",
  "BASKETBALL",
  "BASEBALL",
  "SOFTBALL",
  "FOOTBALL",
  "VOLLEYBALL",
  "OTHER",
] as const;

export type SportValue = (typeof SPORTS)[number];

export const SPORT_LABELS: Record<SportValue, string> = {
  HOCKEY: "Hockey",
  LACROSSE: "Lacrosse",
  SOCCER: "Soccer",
  BASKETBALL: "Basketball",
  BASEBALL: "Baseball",
  SOFTBALL: "Softball",
  FOOTBALL: "Football",
  VOLLEYBALL: "Volleyball",
  OTHER: "Other",
};

// Sports that appear first (primary focus)
export const FEATURED_SPORTS: SportValue[] = ["HOCKEY", "LACROSSE"];

export const sportSchema = z.enum(SPORTS, {
  message: "Please select a valid sport",
});

export const SURFACE_TYPES = ["ICE", "STUDIO", "ROOM", "DRYLAND", "TURF", "COURT", "FIELD", "OTHER"] as const;
export const VENUE_ORGANIZATION_TYPES = ["RINK", "ARENA", "SKATING_CENTER", "SPORTS_COMPLEX", "OTHER"] as const;
export const VENUE_STAFF_ROLES = [
  "OWNER",
  "MANAGER",
  "SCHEDULER",
  "CONTENT_EDITOR",
  "REQUEST_MANAGER",
  "VIEWER",
] as const;
export const VENUE_PROFILE_STATUSES = ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"] as const;
export const OPERATING_HOUR_STATUSES = ["OPEN", "CLOSED", "RESTRICTED"] as const;
export const VENUE_SCHEDULE_ACTIVITY_TYPES = [
  "OPEN_SKATE",
  "STICK_AND_PICK",
  "FREE_SKATE",
  "FIGURE_SKATING",
  "SPECIALTY_EVENT",
  "PRIVATE_LESSON",
  "PUBLIC_LESSON",
  "TEAM_ICE",
  "ORGANIZATION_ICE",
  "RENTAL",
  "CLOSURE",
  "CUSTOM",
] as const;
export const VENUE_SCHEDULE_AUDIENCES = [
  "PUBLIC",
  "TEAMS",
  "COACHES",
  "ORGANIZATIONS",
  "INVITE_ONLY",
  "STAFF_ONLY",
] as const;
export const VENUE_SCHEDULE_VISIBILITIES = ["PUBLIC", "AUTHENTICATED", "RELATIONSHIP_ONLY", "PRIVATE"] as const;
export const VENUE_SCHEDULE_BLOCK_STATUSES = ["DRAFT", "PUBLISHED", "CANCELED", "ARCHIVED"] as const;
export const REGISTRATION_MODES = ["INFO_ONLY", "REQUEST_REQUIRED", "EXTERNAL_REGISTRATION", "SELF_REGISTER"] as const;
export const ICE_TIME_REQUEST_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "DECLINED",
  "CANCELED",
  "EXPIRED",
] as const;
export const LESSON_OFFERING_TYPES = ["PRIVATE", "SEMI_PRIVATE", "GROUP", "CLINIC", "CAMP"] as const;
export const VENUE_CONTENT_POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"] as const;
export const VENUE_RELATIONSHIP_TYPES = ["PREFERRED", "HOME"] as const;
export const VENUE_RELATIONSHIP_TARGET_TYPES = ["TEAM", "LEAGUE", "COACH", "ORGANIZATION"] as const;
export const SKILL_LEVEL_SOURCES = ["USA_HOCKEY", "US_FIGURE_SKATING", "RINK_CUSTOM", "OTHER"] as const;
export const SKILL_LEVEL_DISCIPLINES = ["HOCKEY", "FIGURE_SKATING", "SKATING", "GOALIE", "OTHER"] as const;

/**
 * Type-safe wrapper for Zod .pick() with computed property names.
 *
 * Zod 4.x `.pick()` requires a literal object type like `{ email: true }`,
 * but computed property names `{ [name]: true }` produce `{ [x: string]: true }`
 * which fails type-checking. This helper encapsulates the necessary assertion.
 */
export function pickField<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  field: keyof z.input<T>,
) {
  const key = field as string;
  return z.object({ [key]: schema.shape[key] });
}

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

const optionalCuid = (message: string) => z.string().cuid(message).optional().or(z.literal(""));
const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "Time format must be HH:MM");
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a 3- or 6-digit hex value")
  .optional()
  .or(z.literal(""));
const optionalUrlSchema = (maxLength = 500) =>
  optionalSanitizedString(maxLength).refine((value) => !value || z.string().url().safeParse(value).success, {
    message: "Invalid URL",
  });
const optionalEmailSchema = optionalSanitizedString(254).refine(
  (value) => !value || z.string().email().safeParse(value).success,
  {
    message: "Invalid email address",
  }
);
const optionalPositiveInt = (message: string, max?: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .int(message)
      .min(1, message)
      .pipe(max ? z.number().max(max, message) : z.number())
      .optional()
  );

// Ordered age ranks shared by signup events, divisions, and season scheduling
// (mirrors the Prisma AgeClassification enum).
export const AGE_CLASSIFICATIONS = [
  "U6",
  "U8",
  "SQUIRT_U10",
  "PEEWEE_U12",
  "BANTAM_U14",
  "U16",
  "U18",
  "JUNIOR",
  "ADULT",
  "OPEN",
] as const;

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

/**
 * Format a sport enum value into a user-friendly label.
 *
 * Use this for all user-facing sport chips/labels instead of rendering
 * the raw enum (e.g. "HOCKEY") directly.
 */
export function formatSport(sport: SportValue | string | null | undefined): string {
  if (!sport) {
    return "Unknown";
  }
  return SPORT_LABELS[sport as SportValue] ?? sport;
}

// Team validation schemas
export const createTeamSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  sport: sportSchema,
  season: sanitizedStringWithMin(1, 50),
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
  jerseyNumber: z
    .number()
    .int("Jersey number must be a whole number")
    .min(1, "Jersey number must be between 1 and 99")
    .max(99, "Jersey number must be between 1 and 99")
    .nullable()
    .optional(),
  usahMemberId: z
    .string()
    .trim()
    .max(20, "USA Hockey Member ID must be 20 characters or fewer")
    .regex(/^[a-zA-Z0-9]*$/, "USA Hockey Member ID must be alphanumeric")
    .nullable()
    .optional(),
});

export const updatePlayerSchema = addPlayerSchema.extend({
  id: z.string().min(1, "Player ID is required"),
});

// Team member USAH ID update schema
export const updateTeamMemberUsahIdSchema = z.object({
  teamMemberId: z.string().cuid("Invalid team member ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
  usahMemberId: z
    .string()
    .trim()
    .max(20, "USA Hockey Member ID must be 20 characters or fewer")
    .regex(/^[a-zA-Z0-9]*$/, "USA Hockey Member ID must be alphanumeric")
    .nullable()
    .optional(),
});

export type UpdateTeamMemberUsahIdInput = z.infer<typeof updateTeamMemberUsahIdSchema>;

// Event validation schemas
const baseEventSchema = z.object({
  type: z.enum(["GAME", "PRACTICE"], {
    message: "Event type must be GAME or PRACTICE",
  }),
  title: sanitizedStringWithMin(1, 100).refine(val => val.length > 0, "Title is required"),
  startAt: z.coerce.date({
    message: "Valid date and time is required",
  }),
  endAt: z.coerce.date({
    message: "Valid end date and time is required",
  }).optional(),
  location: sanitizedStringWithMin(1, 200).refine(val => val.length > 0, "Location is required"),
  venueId: z.string().cuid("Invalid venue ID format").optional().or(z.literal("")),
  timezone: optionalTimeZoneSchema,
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
      // If endAt provided, it must be after startAt
      if (data.endAt) {
        return data.endAt > data.startAt;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endAt"],
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
      // If endAt provided, it must be after startAt
      if (data.endAt) {
        return data.endAt > data.startAt;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endAt"],
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
  sport: sportSchema,
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
  sport: sportSchema,
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
  sport: sportSchema,
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
  // Structured age level driving score/standings gating for season games
  ageClassification: z.enum(AGE_CLASSIFICATIONS).optional(),
  skillLevel: optionalSanitizedString(50),
});

export const updateDivisionSchema = z.object({
  id: z.string().cuid("Invalid division ID format"),
  leagueId: z.string().cuid("Invalid league ID format"),
  name: sanitizedStringWithMin(1, 100),
  ageGroup: optionalSanitizedString(50),
  ageClassification: z.enum(AGE_CLASSIFICATIONS).optional().nullable(),
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
  sport: sportSchema.optional(),
  season: z.string().optional(),
  divisionId: z.string().cuid().optional().nullable(),
});

// Inter-team game validation schema
export const createInterTeamGameSchema = z.object({
  title: sanitizedStringWithMin(1, 100),
  startAt: z.coerce.date({
    message: "Valid date and time is required",
  }),
  location: sanitizedStringWithMin(1, 200),
  notes: optionalSanitizedString(1000),
  leagueId: z.string().cuid("Invalid league ID format"),
  homeTeamId: z.string().min(1, "Home team is required").cuid("Invalid home team ID format"),
  awayTeamId: z.string().min(1, "Away team is required").cuid("Invalid away team ID format"),
  overrideConflicts: z.boolean().optional().default(false),
  timezone: optionalTimeZoneSchema,
})
  .refine(
    (data) => {
      // Validate date is not in the past
      return data.startAt > new Date();
    },
    {
      message: "Game date must be in the future",
      path: ["startAt"],
    }
  )
  .refine(
    (data) => {
      // Ensure home and away teams are different
      return data.homeTeamId !== data.awayTeamId;
    },
    {
      message: "Home and away teams must be different",
      path: ["awayTeamId"],
    }
  );

// League communication validation schemas
export const sendLeagueMessageSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  subject: sanitizedStringWithMin(1, 200),
  content: sanitizedStringWithMin(1, 5000),
  messageType: z.enum(["MESSAGE", "ANNOUNCEMENT"]).default("MESSAGE"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  targeting: z.object({
    entireLeague: z.boolean().default(false),
    divisionIds: z.array(z.string().cuid()).optional(),
    teamIds: z.array(z.string().cuid()).optional(),
  }).refine(
    (data) => {
      // At least one targeting option must be specified
      return data.entireLeague ||
        (data.divisionIds && data.divisionIds.length > 0) ||
        (data.teamIds && data.teamIds.length > 0);
    },
    {
      message: "At least one targeting option must be specified",
    }
  ),
});

export const getLeagueMessagesSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
  messageType: z.enum(["MESSAGE", "ANNOUNCEMENT"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

// Type exports
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type AddPlayerInput = z.infer<typeof addPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateInterTeamGameInput = z.infer<typeof createInterTeamGameSchema>;
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
export type SendLeagueMessageInput = z.infer<typeof sendLeagueMessageSchema>;
export type GetLeagueMessagesInput = z.infer<typeof getLeagueMessagesSchema>;

// Venue validation schemas
export const createVenueSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  address: optionalSanitizedString(200),
  city: optionalSanitizedString(100),
  state: optionalSanitizedString(50),
  zipCode: optionalSanitizedString(20),
  surfaceType: z.enum(SURFACE_TYPES, {
    message: "Please select a valid surface type",
  }).default("OTHER"),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
  amenities: z.array(z.string().max(50)).max(20).default([]),
  phone: optionalSanitizedString(20),
  website: optionalSanitizedString(500),
  notes: optionalSanitizedString(1000),
  visibility: z.enum(["PUBLIC", "LEAGUE", "TEAM"], {
    message: "Visibility must be PUBLIC, LEAGUE, or TEAM",
  }).default("PUBLIC"),
  teamId: z.string().cuid("Invalid team ID format").optional().or(z.literal("")),
  leagueId: z.string().cuid("Invalid league ID format").optional().or(z.literal("")),
  organizationId: optionalCuid("Invalid organization ID format"),
}).refine(
  (data) => {
    // LEAGUE visibility requires leagueId
    if (data.visibility === "LEAGUE" && !data.leagueId) {
      return false;
    }
    return true;
  },
  {
    message: "League ID is required for league-visible venues",
    path: ["leagueId"],
  }
).refine(
  (data) => {
    // TEAM visibility requires teamId
    if (data.visibility === "TEAM" && !data.teamId) {
      return false;
    }
    return true;
  },
  {
    message: "Team ID is required for team-private venues",
    path: ["teamId"],
  }
);

export const updateVenueSchema = z.object({
  id: z.string().cuid("Invalid venue ID format"),
  name: sanitizedStringWithMin(1, 100),
  address: optionalSanitizedString(200),
  city: optionalSanitizedString(100),
  state: optionalSanitizedString(50),
  zipCode: optionalSanitizedString(20),
  surfaceType: z.enum(SURFACE_TYPES).default("OTHER"),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
  amenities: z.array(z.string().max(50)).max(20).default([]),
  phone: optionalSanitizedString(20),
  website: optionalSanitizedString(500),
  notes: optionalSanitizedString(1000),
  visibility: z.enum(["PUBLIC", "LEAGUE", "TEAM"]).default("PUBLIC"),
  teamId: z.string().cuid("Invalid team ID format").optional().or(z.literal("")),
  leagueId: z.string().cuid("Invalid league ID format").optional().or(z.literal("")),
  organizationId: optionalCuid("Invalid organization ID format"),
}).refine(
  (data) => {
    if (data.visibility === "LEAGUE" && !data.leagueId) {
      return false;
    }
    return true;
  },
  {
    message: "League ID is required for league-visible venues",
    path: ["leagueId"],
  }
).refine(
  (data) => {
    if (data.visibility === "TEAM" && !data.teamId) {
      return false;
    }
    return true;
  },
  {
    message: "Team ID is required for team-private venues",
    path: ["teamId"],
  }
);

export const venueAvailabilitySchema = z.object({
  venueId: z.string().cuid("Invalid venue ID format"),
  startAt: z.coerce.date({ message: "Valid start date is required" }),
  endAt: z.coerce.date({ message: "Valid end date is required" }),
  excludeEventId: z.string().cuid("Invalid event ID format").optional(),
}).refine(
  (data) => data.endAt > data.startAt,
  {
    message: "End time must be after start time",
    path: ["endAt"],
  }
);

// Venue management validation schemas
export const createVenueOrganizationSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  type: z.enum(VENUE_ORGANIZATION_TYPES).default("RINK"),
  description: optionalSanitizedString(1000),
  primaryContactName: optionalSanitizedString(100),
  primaryContactEmail: optionalEmailSchema,
  primaryContactPhone: optionalSanitizedString(30),
  website: optionalUrlSchema(),
});

export const updateVenueOrganizationSchema = createVenueOrganizationSchema.extend({
  organizationId: z.string().cuid("Invalid organization ID format"),
});

export const updateVenueProfileSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: optionalCuid("Invalid venue ID format"),
  name: sanitizedStringWithMin(1, 100).optional(),
  address: optionalSanitizedString(200),
  city: optionalSanitizedString(100),
  state: optionalSanitizedString(50),
  zipCode: optionalSanitizedString(20),
  surfaceType: z.enum(SURFACE_TYPES).optional(),
  capacity: optionalPositiveInt("Capacity must be a positive whole number"),
  amenities: z.array(sanitizedStringWithMin(1, 50)).max(20).optional(),
  phone: optionalSanitizedString(20),
  website: optionalUrlSchema(),
  notes: optionalSanitizedString(1000),
  slug: sanitizedStringWithMin(3, 80)
    .refine(
      (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      "Slug must use lowercase letters, numbers, and hyphens"
    )
    .optional()
    .or(z.literal("")),
  publicDescription: optionalSanitizedString(2000),
  logoUrl: optionalUrlSchema(),
  brandPrimaryColor: hexColorSchema,
  brandSecondaryColor: hexColorSchema,
  timezone: sanitizedStringWithMin(1, 100).optional(),
  publicEmail: optionalEmailSchema,
  publicPhone: optionalSanitizedString(30),
  privateManagerNotes: optionalSanitizedString(2000),
});

export const publishVenueProfileSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
});

export const inviteVenueStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: optionalCuid("Invalid venue ID format"),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
  role: z.enum(VENUE_STAFF_ROLES).refine((role) => role !== "OWNER", {
    message: "Owner role cannot be assigned by invitation",
  }),
});

export const updateVenueStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  staffId: z.string().cuid("Invalid staff ID format"),
  role: z.enum(VENUE_STAFF_ROLES).refine((role) => role !== "OWNER", {
    message: "Owner role cannot be assigned here",
  }),
});

export const createIceSurfaceSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  name: sanitizedStringWithMin(1, 100),
  surfaceType: z.enum(SURFACE_TYPES).default("ICE"),
  capacity: optionalPositiveInt("Capacity must be a positive whole number"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(1000).default(0),
  notes: optionalSanitizedString(1000),
});

export const updateIceSurfaceSchema = createIceSurfaceSchema.extend({
  surfaceId: z.string().cuid("Invalid surface ID format"),
});

export const venueOperatingHourSchema = z
  .object({
    organizationId: z.string().cuid("Invalid organization ID format"),
    venueId: z.string().cuid("Invalid venue ID format"),
    surfaceId: optionalCuid("Invalid surface ID format"),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    opensAt: timeStringSchema,
    closesAt: timeStringSchema,
    effectiveStartDate: z.coerce.date({ message: "Valid effective start date is required" }),
    effectiveEndDate: z.coerce.date({ message: "Valid effective end date is required" }).optional(),
    status: z.enum(OPERATING_HOUR_STATUSES).default("OPEN"),
    label: optionalSanitizedString(100),
    notes: optionalSanitizedString(1000),
  })
  .refine((data) => !data.effectiveEndDate || data.effectiveEndDate >= data.effectiveStartDate, {
    message: "Effective end date must be on or after the start date",
    path: ["effectiveEndDate"],
  });

export const venueScheduleBlockSchema = z
  .object({
    organizationId: z.string().cuid("Invalid organization ID format"),
    venueId: z.string().cuid("Invalid venue ID format"),
    surfaceId: optionalCuid("Invalid surface ID format"),
    title: sanitizedStringWithMin(1, 120),
    description: optionalSanitizedString(2000),
    activityType: z.enum(VENUE_SCHEDULE_ACTIVITY_TYPES),
    audience: z.enum(VENUE_SCHEDULE_AUDIENCES).default("PUBLIC"),
    visibility: z.enum(VENUE_SCHEDULE_VISIBILITIES).default("PUBLIC"),
    status: z.enum(VENUE_SCHEDULE_BLOCK_STATUSES).default("DRAFT"),
    startsAt: z.coerce.date({ message: "Valid start date is required" }),
    endsAt: z.coerce.date({ message: "Valid end date is required" }),
    recurrenceRule: optionalSanitizedString(500),
    recurrenceStartDate: z.coerce.date().optional(),
    recurrenceEndDate: z.coerce.date().optional(),
    capacity: optionalPositiveInt("Capacity must be a positive whole number"),
    priceAmount: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.number().int().min(0, "Price must be zero or greater").optional()
    ),
    priceCurrency: sanitizedStringWithMin(3, 3).default("USD"),
    priceLabel: optionalSanitizedString(100),
    registrationMode: z.enum(REGISTRATION_MODES).default("INFO_ONLY"),
    externalRegistrationUrl: optionalUrlSchema(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  })
  .refine((data) => !data.recurrenceEndDate || !data.recurrenceStartDate || data.recurrenceEndDate >= data.recurrenceStartDate, {
    message: "Recurrence end date must be on or after the start date",
    path: ["recurrenceEndDate"],
  })
  .refine((data) => data.registrationMode !== "EXTERNAL_REGISTRATION" || !!data.externalRegistrationUrl, {
    message: "External registration URL is required",
    path: ["externalRegistrationUrl"],
  });

export const submitIceTimeRequestSchema = z
  .object({
    scheduleBlockId: z.string().cuid("Invalid schedule block ID format"),
    venueId: z.string().cuid("Invalid venue ID format"),
    requesterTeamId: optionalCuid("Invalid team ID format"),
    requesterLeagueId: optionalCuid("Invalid league ID format"),
    requesterOrganizationName: optionalSanitizedString(150),
    contactName: sanitizedStringWithMin(1, 100),
    contactEmail: z.string().trim().toLowerCase().email("Invalid email address").max(254),
    contactPhone: optionalSanitizedString(30),
    requestedStartAt: z.coerce.date({ message: "Valid requested start time is required" }),
    requestedEndAt: z.coerce.date({ message: "Valid requested end time is required" }),
    notes: optionalSanitizedString(2000),
  })
  .refine((data) => data.requestedEndAt > data.requestedStartAt, {
    message: "Requested end time must be after requested start time",
    path: ["requestedEndAt"],
  });

export const decideIceTimeRequestSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  requestId: z.string().cuid("Invalid request ID format"),
  status: z.enum(["ACCEPTED", "DECLINED"]),
  decisionMessage: optionalSanitizedString(1000),
});

export const lessonOfferingSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  surfaceId: optionalCuid("Invalid surface ID format"),
  title: sanitizedStringWithMin(1, 120),
  description: optionalSanitizedString(2000),
  lessonType: z.enum(LESSON_OFFERING_TYPES),
  instructorName: optionalSanitizedString(100),
  priceAmount: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(0, "Price must be zero or greater").optional()
  ),
  priceCurrency: sanitizedStringWithMin(3, 3).default("USD"),
  durationMinutes: optionalPositiveInt("Duration must be a positive whole number", 600),
  availabilityDescription: optionalSanitizedString(1000),
  registrationMode: z.enum(REGISTRATION_MODES).default("INFO_ONLY"),
  externalRegistrationUrl: optionalUrlSchema(),
});

export const venueContentPostSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  postId: optionalCuid("Invalid post ID format"),
  title: sanitizedStringWithMin(1, 150),
  slug: sanitizedStringWithMin(3, 100).refine(
    (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    "Invalid post slug"
  ),
  excerpt: optionalSanitizedString(300),
  body: sanitizedStringWithMin(1, 10000),
  status: z.enum(VENUE_CONTENT_POST_STATUSES).default("DRAFT"),
  scheduledFor: z.coerce.date().optional(),
});

export const venueRelationshipSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  relationshipType: z.enum(VENUE_RELATIONSHIP_TYPES),
  targetType: z.enum(VENUE_RELATIONSHIP_TARGET_TYPES),
  teamId: optionalCuid("Invalid team ID format"),
  leagueId: optionalCuid("Invalid league ID format"),
  targetName: optionalSanitizedString(150),
  invitedEmail: optionalEmailSchema,
  expiresAt: z.coerce.date().optional(),
});

export const skillLevelReferenceSchema = z.object({
  source: z.enum(SKILL_LEVEL_SOURCES),
  discipline: z.enum(SKILL_LEVEL_DISCIPLINES),
  label: sanitizedStringWithMin(1, 100),
  description: optionalSanitizedString(500),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().default(true),
});

// --- Rink session registration & purchasing ---

export const SESSION_REGISTRATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "CANCELED",
  "REFUNDED",
  "EXPIRED",
] as const;

/**
 * End-user opt-in for a self-register schedule block OR lesson offering.
 * Exactly one of scheduleBlockId / lessonOfferingId must be provided. Price is
 * never accepted from the client — the server snapshots it from the offering.
 */
export const sessionRegistrationSchema = z
  .object({
    venueId: z.string().cuid("Invalid venue ID format"),
    scheduleBlockId: optionalCuid("Invalid schedule block ID format"),
    lessonOfferingId: optionalCuid("Invalid lesson ID format"),
    participantName: sanitizedStringWithMin(1, 100),
    participantEmail: z.string().trim().toLowerCase().email("Invalid email address").max(254),
    participantPhone: optionalSanitizedString(30),
    skillLevelNote: optionalSanitizedString(120),
    notes: optionalSanitizedString(1000),
    quantity: z.coerce.number().int().min(1, "At least one spot is required").max(20, "Too many spots"),
  })
  .refine(
    (data) => Boolean(data.scheduleBlockId) !== Boolean(data.lessonOfferingId),
    {
      message: "Select exactly one session or lesson to register for",
      path: ["scheduleBlockId"],
    }
  );

export const connectOnboardingSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
});

export const registrationCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  registrationId: z.string().cuid("Invalid registration ID format"),
});

export const refundRegistrationSchema = registrationCommandSchema.extend({
  reason: optionalSanitizedString(500),
});

export type CreateVenueOrganizationInput = z.input<typeof createVenueOrganizationSchema>;
export type UpdateVenueOrganizationInput = z.input<typeof updateVenueOrganizationSchema>;
export type UpdateVenueProfileInput = z.input<typeof updateVenueProfileSchema>;
export type InviteVenueStaffInput = z.input<typeof inviteVenueStaffSchema>;
export type UpdateVenueStaffInput = z.input<typeof updateVenueStaffSchema>;
export type CreateIceSurfaceInput = z.input<typeof createIceSurfaceSchema>;
export type UpdateIceSurfaceInput = z.input<typeof updateIceSurfaceSchema>;
export type VenueOperatingHourInput = z.input<typeof venueOperatingHourSchema>;
export type VenueScheduleBlockInput = z.input<typeof venueScheduleBlockSchema>;
export type SubmitIceTimeRequestInput = z.input<typeof submitIceTimeRequestSchema>;
export type DecideIceTimeRequestInput = z.input<typeof decideIceTimeRequestSchema>;
export type LessonOfferingInput = z.input<typeof lessonOfferingSchema>;
export type VenueContentPostInput = z.input<typeof venueContentPostSchema>;
export type VenueRelationshipInput = z.input<typeof venueRelationshipSchema>;
export type SkillLevelReferenceInput = z.input<typeof skillLevelReferenceSchema>;
export type SessionRegistrationInput = z.input<typeof sessionRegistrationSchema>;
export type ConnectOnboardingInput = z.input<typeof connectOnboardingSchema>;
export type RegistrationCommandInput = z.input<typeof registrationCommandSchema>;
export type RefundRegistrationInput = z.input<typeof refundRegistrationSchema>;

// Venue type exports
export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
export type VenueAvailabilityInput = z.infer<typeof venueAvailabilitySchema>;

// Practice planner validation schemas

// Maximum thumbnail size (1MB in base64 is ~1.37MB, so limit to ~750KB base64)
const MAX_THUMBNAIL_SIZE = 1000000;

// Base64 image validation helper
const base64ImageSchema = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|jpg|webp);base64,/,
    "Thumbnail must be a base64-encoded image (PNG, JPEG, or WebP)"
  )
  .max(MAX_THUMBNAIL_SIZE, "Thumbnail must be less than 1MB")
  .optional();

export const createPlaySchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  description: optionalSanitizedString(1000),
  thumbnail: base64ImageSchema,
  playData: z.any(), // Will be validated separately with custom validation
  isTemplate: z.boolean().default(false),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const updatePlaySchema = z.object({
  id: z.string().cuid("Invalid play ID format"),
  name: sanitizedStringWithMin(1, 100),
  description: optionalSanitizedString(1000),
  thumbnail: base64ImageSchema,
  playData: z.any(), // Will be validated separately with custom validation
  isTemplate: z.boolean().optional(),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const deletePlaySchema = z.object({
  id: z.string().cuid("Invalid play ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const getPlayByIdSchema = z.object({
  id: z.string().cuid("Invalid play ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const getPlaysByTeamSchema = z.object({
  teamId: z.string().cuid("Invalid team ID format"),
  isTemplate: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  dateFilter: z.enum(["all", "today", "week", "month"]).optional().default("all"),
});

// Optional venue booking for a practice session (FR-019, feature 006). All
// fields nullable/optional; startAt is REQUIRED when a venue is attached —
// enforced by practiceStartAtRefinement on both schemas below. Unattached
// practices have no availability footprint.
const practiceVenueAttachmentFields = {
  venueId: optionalCuid("Invalid venue ID format"),
  surfaceId: optionalCuid("Invalid surface ID format"),
  segmentId: optionalCuid("Invalid segment ID format"),
  startAt: z.coerce.date().optional(),
  overrideConflicts: z.boolean().default(false),
};

const practiceHasStartAtWhenVenueSet = (data: { venueId?: string; startAt?: Date }) =>
  !data.venueId || Boolean(data.startAt);
const practiceStartAtRequiredIssue = {
  message: "A start time is required when booking a venue",
  path: ["startAt"],
};

export const practiceVenueAttachmentSchema = z
  .object(practiceVenueAttachmentFields)
  .refine(practiceHasStartAtWhenVenueSet, practiceStartAtRequiredIssue);

// Practice session validation schemas
export const createPracticeSessionSchema = z.object({
  title: sanitizedStringWithMin(1, 100),
  date: z.coerce.date({
    message: "Valid date is required",
  }),
  duration: z.number().int().min(1, "Duration must be at least 1 minute").max(300, "Duration must be less than 300 minutes"),
  teamId: z.string().cuid("Invalid team ID format"),
  plays: z.array(z.object({
    playId: z.string().cuid("Invalid play ID format"),
    sequence: z.number().int().min(0),
    duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
    instructions: optionalSanitizedString(2000),
  })).optional().default([]),
  ...practiceVenueAttachmentFields,
}).refine(practiceHasStartAtWhenVenueSet, practiceStartAtRequiredIssue);

export const updatePracticeSessionSchema = z.object({
  id: z.string().cuid("Invalid session ID format"),
  title: sanitizedStringWithMin(1, 100),
  date: z.coerce.date({
    message: "Valid date is required",
  }),
  duration: z.number().int().min(1, "Duration must be at least 1 minute").max(300, "Duration must be less than 300 minutes"),
  teamId: z.string().cuid("Invalid team ID format"),
  plays: z.array(z.object({
    playId: z.string().cuid("Invalid play ID format"),
    sequence: z.number().int().min(0),
    duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
    instructions: optionalSanitizedString(2000),
  })).optional().default([]),
  ...practiceVenueAttachmentFields,
}).refine(practiceHasStartAtWhenVenueSet, practiceStartAtRequiredIssue);

export const deletePracticeSessionSchema = z.object({
  id: z.string().cuid("Invalid session ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const getPracticeSessionByIdSchema = z.object({
  id: z.string().cuid("Invalid session ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
});

export const getPracticeSessionsByTeamSchema = z.object({
  teamId: z.string().cuid("Invalid team ID format"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  dateFilter: z.enum(["all", "upcoming", "past"]).optional().default("all"),
});

export const sharePracticeSessionSchema = z.object({
  id: z.string().cuid("Invalid session ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
  isShared: z.boolean(),
});

// Type exports for practice planner
export type CreatePlayInput = z.infer<typeof createPlaySchema>;
export type UpdatePlayInput = z.infer<typeof updatePlaySchema>;
export type DeletePlayInput = z.infer<typeof deletePlaySchema>;
export type GetPlayByIdInput = z.infer<typeof getPlayByIdSchema>;
export type GetPlaysByTeamInput = z.infer<typeof getPlaysByTeamSchema>;

// Input types (z.input) so defaulted fields (plays, overrideConflicts) stay
// optional for callers.
export type CreatePracticeSessionInput = z.input<typeof createPracticeSessionSchema>;
export type UpdatePracticeSessionInput = z.input<typeof updatePracticeSessionSchema>;
export type PracticeVenueAttachmentInput = z.input<typeof practiceVenueAttachmentSchema>;
export type DeletePracticeSessionInput = z.infer<typeof deletePracticeSessionSchema>;
export type GetPracticeSessionByIdInput = z.infer<typeof getPracticeSessionByIdSchema>;
export type GetPracticeSessionsByTeamInput = z.infer<typeof getPracticeSessionsByTeamSchema>;
export type SharePracticeSessionInput = z.infer<typeof sharePracticeSessionSchema>;

// --- Signup events (feature 004) ---

export const SIGNUP_EVENT_CATEGORIES = [
  "CLINIC",
  "SCRIMMAGE",
  "TRYOUT",
  "VOLUNTEER",
  "FUNDRAISER",
  "TOURNAMENT",
  "SOCIAL",
  "OTHER",
] as const;

export const SIGNUP_EVENT_VISIBILITIES = ["PRIVATE", "INVITE_ONLY", "LINK", "PUBLIC"] as const;

export const PHASE_AUDIENCES = ["HOST_MEMBERS", "SELECTED_GROUPS", "INVITEES", "EVERYONE"] as const;

export const MANUAL_PAYMENT_STATUSES = ["NOT_REQUIRED", "UNPAID", "PAID", "WAIVED"] as const;

export const GALLERY_VISIBILITIES = ["PARTICIPANTS", "EVENT_AUDIENCE"] as const;

/** A capacity-limited role slot within a signup event. `id` present = update existing. */
export const signupSlotSchema = z.object({
  id: optionalCuid("Invalid slot ID format"),
  name: sanitizedStringWithMin(1, 100),
  description: optionalSanitizedString(500),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  capacity: optionalPositiveInt("Capacity must be a positive whole number", 10000),
  priceAmount: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(0, "Price must be zero or greater").optional()
  ),
  waitlistEnabled: z.boolean().default(true),
});

/** An ordered registration access window. `id` present = update existing. */
export const signupPhaseSchema = z.object({
  id: optionalCuid("Invalid phase ID format"),
  name: sanitizedStringWithMin(1, 100),
  opensAt: z.coerce.date({ message: "Valid phase opening time is required" }),
  audience: z.enum(PHASE_AUDIENCES),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
  divisionIds: z.array(z.string().cuid("Invalid division ID format")).max(50).default([]),
  teamIds: z.array(z.string().cuid("Invalid team ID format")).max(100).default([]),
});

const signupEventBaseSchema = z.object({
  title: sanitizedStringWithMin(1, 150),
  description: optionalSanitizedString(5000),
  category: z.enum(SIGNUP_EVENT_CATEGORIES).default("OTHER"),
  ageClassification: z.enum(AGE_CLASSIFICATIONS).default("OPEN"),
  visibility: z.enum(SIGNUP_EVENT_VISIBILITIES).default("PRIVATE"),
  startAt: z.coerce.date({ message: "Valid start time is required" }),
  endAt: z.coerce.date({ message: "Valid end time is required" }),
  timezone: optionalTimeZoneSchema,
  venueId: optionalCuid("Invalid venue ID format"),
  locationText: optionalSanitizedString(300),
  registrationOpensAt: z.coerce.date().optional(),
  registrationClosesAt: z.coerce.date().optional(),
  cancellationCutoffAt: z.coerce.date().optional(),
  contactName: optionalSanitizedString(100),
  contactEmail: optionalEmailSchema,
  contactPhone: optionalSanitizedString(30),
  acceptsOnlinePayment: z.boolean().default(false),
  acceptsManualPayment: z.boolean().default(true),
  venmoHandle: optionalSanitizedString(60),
  zelleHandle: optionalSanitizedString(120),
  cashAppHandle: optionalSanitizedString(60),
  paymentPhone: optionalSanitizedString(30),
  paymentInstructions: optionalSanitizedString(1000),
  galleryEnabled: z.boolean().default(true),
  galleryVisibility: z.enum(GALLERY_VISIBILITIES).default("PARTICIPANTS"),
  publicRoster: z.boolean().default(false),
  slots: z.array(signupSlotSchema).min(1, "At least one signup slot is required").max(50),
  phases: z.array(signupPhaseSchema).max(10).default([]),
});

type SignupEventTimeFields = {
  startAt: Date;
  endAt: Date;
  registrationOpensAt?: Date;
  registrationClosesAt?: Date;
  cancellationCutoffAt?: Date;
};

const applySignupEventTimeChecks = (data: SignupEventTimeFields, ctx: z.RefinementCtx) => {
  if (data.endAt <= data.startAt) {
    ctx.addIssue({ code: "custom", message: "End time must be after start time", path: ["endAt"] });
  }
  if (
    data.registrationClosesAt && data.registrationOpensAt &&
    data.registrationClosesAt <= data.registrationOpensAt
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Registration close must be after registration open",
      path: ["registrationClosesAt"],
    });
  }
  if (data.cancellationCutoffAt && data.cancellationCutoffAt > data.startAt) {
    ctx.addIssue({
      code: "custom",
      message: "Cancellation cutoff must be at or before the event start",
      path: ["cancellationCutoffAt"],
    });
  }
};

/** Create — exactly one hosting entity must be provided. */
export const createSignupEventSchema = signupEventBaseSchema
  .extend({
    hostOrganizationId: optionalCuid("Invalid organization ID format"),
    hostLeagueId: optionalCuid("Invalid league ID format"),
    hostTeamId: optionalCuid("Invalid team ID format"),
  })
  .superRefine((data, ctx) => {
    applySignupEventTimeChecks(data, ctx);
    if ([data.hostOrganizationId, data.hostLeagueId, data.hostTeamId].filter(Boolean).length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one hosting entity is required",
        path: ["hostOrganizationId"],
      });
    }
  });

/** Update — host cannot change after creation. */
export const updateSignupEventSchema = signupEventBaseSchema
  .extend({
    eventId: z.string().cuid("Invalid event ID format"),
  })
  .superRefine(applySignupEventTimeChecks);

export const signupEventCommandSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
});

export const cancelSignupEventSchema = signupEventCommandSchema.extend({
  reason: optionalSanitizedString(500),
});

/** One named participant claiming one spot in a slot. */
export const eventParticipantSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  email: optionalEmailSchema,
  phone: optionalSanitizedString(30),
  notes: optionalSanitizedString(500),
  playerId: optionalCuid("Invalid player ID format"),
});

/**
 * Registration request: one or more named participants into a single slot.
 * Price is never accepted from the client — the server snapshots it.
 */
export const eventRegistrationSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  slotId: z.string().cuid("Invalid slot ID format"),
  // LINK-visibility events pass the link token for access verification.
  linkToken: optionalSanitizedString(128),
  // For priced slots on events accepting both methods. ONLINE checkout is
  // limited to one participant per request (one checkout = one payment).
  paymentMethod: z.enum(["ONLINE", "MANUAL"]).optional(),
  participants: z
    .array(eventParticipantSchema)
    .min(1, "At least one participant is required")
    .max(10, "Too many participants in one request"),
});

export const eventRegistrationCommandSchema = z.object({
  registrationId: z.string().cuid("Invalid registration ID format"),
});

export const setEventCheckInSchema = eventRegistrationCommandSchema.extend({
  checkedIn: z.boolean(),
});

export const removeEventRegistrationSchema = eventRegistrationCommandSchema.extend({
  reason: optionalSanitizedString(500),
});

export type SignupSlotInput = z.input<typeof signupSlotSchema>;
export type SignupPhaseInput = z.input<typeof signupPhaseSchema>;
export type CreateSignupEventInput = z.input<typeof createSignupEventSchema>;
export type UpdateSignupEventInput = z.input<typeof updateSignupEventSchema>;
export type SignupEventCommandInput = z.input<typeof signupEventCommandSchema>;
export type CancelSignupEventInput = z.input<typeof cancelSignupEventSchema>;
export type EventParticipantInput = z.input<typeof eventParticipantSchema>;
export type EventRegistrationInput = z.input<typeof eventRegistrationSchema>;
export type EventRegistrationCommandInput = z.input<typeof eventRegistrationCommandSchema>;
export type SetEventCheckInInput = z.input<typeof setEventCheckInSchema>;
export type RemoveEventRegistrationInput = z.input<typeof removeEventRegistrationSchema>;

export const sendEventInvitationsSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  emails: z
    .array(z.string().trim().toLowerCase().email("Invalid email address").max(254))
    .min(1, "Add at least one email address")
    .max(100, "Too many invitations at once"),
});

export const eventInvitationCommandSchema = z.object({
  invitationId: z.string().cuid("Invalid invitation ID format"),
});

export type SendEventInvitationsInput = z.input<typeof sendEventInvitationsSchema>;
export type EventInvitationCommandInput = z.input<typeof eventInvitationCommandSchema>;

export const leaguePaymentCommandSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
});

export const setManualPaymentStatusSchema = z.object({
  registrationId: z.string().cuid("Invalid registration ID format"),
  status: z.enum(["UNPAID", "PAID", "WAIVED"]),
});

export const refundEventRegistrationSchema = z.object({
  registrationId: z.string().cuid("Invalid registration ID format"),
  reason: optionalSanitizedString(500),
});

export type LeaguePaymentCommandInput = z.input<typeof leaguePaymentCommandSchema>;
export type SetManualPaymentStatusInput = z.input<typeof setManualPaymentStatusSchema>;
export type RefundEventRegistrationInput = z.input<typeof refundEventRegistrationSchema>;

export const addEventManagerSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
});

export const eventManagerCommandSchema = z.object({
  managerId: z.string().cuid("Invalid manager ID format"),
});

export type AddEventManagerInput = z.input<typeof addEventManagerSchema>;
export type EventManagerCommandInput = z.input<typeof eventManagerCommandSchema>;

// --- Event teams, games & rotations (US7) ---

export const eventTeamSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  teamId: optionalCuid("Invalid team ID format"),
  name: sanitizedStringWithMin(1, 60),
  colorHex: hexColorSchema,
  notes: optionalSanitizedString(500),
});

export const eventTeamCommandSchema = z.object({
  teamId: z.string().cuid("Invalid team ID format"),
});

export const assignToEventTeamSchema = z.object({
  eventTeamId: z.string().cuid("Invalid team ID format"),
  registrationIds: z.array(z.string().cuid("Invalid registration ID format")).min(1).max(200),
});

export const removeTeamAssignmentSchema = z.object({
  registrationId: z.string().cuid("Invalid registration ID format"),
});

export const setFloaterSchema = z.object({
  registrationId: z.string().cuid("Invalid registration ID format"),
  isFloater: z.boolean(),
});

export const eventGameSchema = z
  .object({
    eventId: z.string().cuid("Invalid event ID format"),
    gameId: optionalCuid("Invalid game ID format"),
    name: optionalSanitizedString(100),
    homeTeamId: z.string().cuid("Invalid team ID format"),
    awayTeamId: z.string().cuid("Invalid team ID format"),
    startAt: z.coerce.date({ message: "Valid game start time is required" }),
    endAt: z.coerce.date({ message: "Valid game end time is required" }),
    surfaceId: optionalCuid("Invalid surface ID format"),
    segmentId: optionalCuid("Invalid segment ID format"),
    notes: optionalSanitizedString(500),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "Game end must be after game start",
    path: ["endAt"],
  })
  .refine((data) => data.homeTeamId !== data.awayTeamId, {
    message: "A team cannot play itself",
    path: ["awayTeamId"],
  });

export const eventGameCommandSchema = z.object({
  gameId: z.string().cuid("Invalid game ID format"),
});

export const setGameRotationSchema = z.object({
  gameId: z.string().cuid("Invalid game ID format"),
  entries: z
    .array(
      z.object({
        registrationId: z.string().cuid("Invalid registration ID format"),
        eventTeamId: z.string().cuid("Invalid team ID format"),
      })
    )
    .max(100),
});

export type EventTeamInput = z.input<typeof eventTeamSchema>;
export type EventTeamCommandInput = z.input<typeof eventTeamCommandSchema>;
export type AssignToEventTeamInput = z.input<typeof assignToEventTeamSchema>;
export type RemoveTeamAssignmentInput = z.input<typeof removeTeamAssignmentSchema>;
export type SetFloaterInput = z.input<typeof setFloaterSchema>;
export type EventGameInput = z.input<typeof eventGameSchema>;
export type EventGameCommandInput = z.input<typeof eventGameCommandSchema>;
export type SetGameRotationInput = z.input<typeof setGameRotationSchema>;

// --- Event media galleries (US8) ---

export const finalizeEventMediaSchema = z.object({
  eventId: z.string().cuid("Invalid event ID format"),
  url: z.string().url("Invalid media URL").max(1000),
  contentType: sanitizedStringWithMin(1, 100),
  sizeBytes: z.coerce.number().int().min(1).max(500 * 1024 * 1024),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
  durationSeconds: z.coerce.number().int().min(1).max(3600).optional(),
  caption: optionalSanitizedString(300),
});

export const eventMediaCommandSchema = z.object({
  mediaItemId: z.string().cuid("Invalid media item ID format"),
});

export type FinalizeEventMediaInput = z.input<typeof finalizeEventMediaSchema>;
export type EventMediaCommandInput = z.input<typeof eventMediaCommandSchema>;

// --- Age-gated game results & stats (US9) ---

export const recordGameResultSchema = z.object({
  gameId: z.string().cuid("Invalid game ID format"),
  homeScore: z.coerce.number().int().min(0).max(99),
  awayScore: z.coerce.number().int().min(0).max(99),
  stats: z
    .array(
      z.object({
        registrationId: z.string().cuid("Invalid registration ID format"),
        goals: z.coerce.number().int().min(0).max(50).default(0),
        assists: z.coerce.number().int().min(0).max(50).default(0),
      })
    )
    .max(60)
    .default([]),
});

export type RecordGameResultInput = z.input<typeof recordGameResultSchema>;

// ============================================================================
// Season & game scheduling validation schemas (005-season-scheduling)
// ============================================================================

export const SCHEDULE_FORMATS = [
  "ROUND_ROBIN",
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION",
  "POOL_PLAY",
  "LADDER",
  "CUSTOM",
] as const;

export const SEASON_PHASE_TYPES = ["PRE_SEASON", "REGULAR_SEASON", "PLAYOFFS", "CUSTOM"] as const;

// Owner is resolved and authorized server-side; exactly one of leagueId/teamId.
export const createSeasonSchema = z
  .object({
    name: sanitizedStringWithMin(1, 120),
    description: optionalSanitizedString(1000),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    leagueId: optionalCuid("Invalid league ID format"),
    teamId: optionalCuid("Invalid team ID format"),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((data) => Boolean(data.leagueId) !== Boolean(data.teamId), {
    message: "A season belongs to exactly one league or team",
    path: ["leagueId"],
  });

// Format is an optional label — never required (FR-004).
export const updateSeasonSchema = z
  .object({
    seasonId: z.string().cuid("Invalid season ID format"),
    name: sanitizedStringWithMin(1, 120).optional(),
    description: optionalSanitizedString(1000),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    format: z.enum(SCHEDULE_FORMATS).nullable().optional(),
    formatRounds: z.coerce.number().int().min(1).max(4).nullable().optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const seasonCommandSchema = z.object({
  seasonId: z.string().cuid("Invalid season ID format"),
});

export const createSeasonPhaseSchema = z
  .object({
    seasonId: z.string().cuid("Invalid season ID format"),
    name: sanitizedStringWithMin(1, 100),
    type: z.enum(SEASON_PHASE_TYPES).default("CUSTOM"),
    sortOrder: z.coerce.number().int().min(0).default(0),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    format: z.enum(SCHEDULE_FORMATS).nullable().optional(),
    formatRounds: z.coerce.number().int().min(1).max(4).nullable().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const updateSeasonPhaseSchema = z
  .object({
    phaseId: z.string().cuid("Invalid phase ID format"),
    name: sanitizedStringWithMin(1, 100).optional(),
    type: z.enum(SEASON_PHASE_TYPES).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    format: z.enum(SCHEDULE_FORMATS).nullable().optional(),
    formatRounds: z.coerce.number().int().min(1).max(4).nullable().optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const phaseCommandSchema = z.object({
  phaseId: z.string().cuid("Invalid phase ID format"),
});

const seasonGameFields = {
  phaseId: optionalCuid("Invalid phase ID format"),
  homeTeamId: z.string().cuid("Invalid home team ID format"),
  awayTeamId: z.string().cuid("Invalid away team ID format"),
  startAt: z.coerce.date({ message: "Valid start time is required" }),
  endAt: z.coerce.date({ message: "Valid end time is required" }),
  timezone: optionalTimeZoneSchema,
  venueId: optionalCuid("Invalid venue ID format"),
  surfaceId: optionalCuid("Invalid surface ID format"),
  segmentId: optionalCuid("Invalid segment ID format"),
  locationText: optionalSanitizedString(255),
  notes: optionalSanitizedString(1000),
};

export const createSeasonGameSchema = z
  .object({
    seasonId: z.string().cuid("Invalid season ID format"),
    ...seasonGameFields,
    publish: z.boolean().default(true),
    overrideConflicts: z.boolean().default(false),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "End time must be after the start time",
    path: ["endAt"],
  })
  .refine((data) => data.homeTeamId !== data.awayTeamId, {
    message: "Home and away teams must be different",
    path: ["awayTeamId"],
  });

export const updateSeasonGameSchema = z
  .object({
    gameId: z.string().cuid("Invalid game ID format"),
    phaseId: optionalCuid("Invalid phase ID format").nullable(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    timezone: optionalTimeZoneSchema,
    venueId: optionalCuid("Invalid venue ID format").nullable(),
    surfaceId: optionalCuid("Invalid surface ID format").nullable(),
    segmentId: optionalCuid("Invalid segment ID format").nullable(),
    locationText: optionalSanitizedString(255),
    notes: optionalSanitizedString(1000),
    overrideConflicts: z.boolean().default(false),
  })
  .refine((data) => !data.startAt || !data.endAt || data.endAt > data.startAt, {
    message: "End time must be after the start time",
    path: ["endAt"],
  });

export const seasonGameCommandSchema = z.object({
  gameId: z.string().cuid("Invalid game ID format"),
});

export const publishSeasonGamesSchema = z.object({
  seasonId: z.string().cuid("Invalid season ID format"),
  gameIds: z.array(z.string().cuid("Invalid game ID format")).max(200).optional(),
});

export const recordSeasonGameScoreSchema = z.object({
  gameId: z.string().cuid("Invalid game ID format"),
  homeScore: z.coerce.number().int().min(0).max(99),
  awayScore: z.coerce.number().int().min(0).max(99),
});

export const checkGameConflictsSchema = z
  .object({
    venueId: z.string().cuid("Invalid venue ID format"),
    surfaceId: optionalCuid("Invalid surface ID format"),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    excludeGameId: optionalCuid("Invalid game ID format"),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "End time must be after the start time",
    path: ["endAt"],
  });

export const generateRoundRobinSchema = z
  .object({
    seasonId: z.string().cuid("Invalid season ID format"),
    phaseId: optionalCuid("Invalid phase ID format"),
    teamIds: z
      .array(z.string().cuid("Invalid team ID format"))
      .min(2, "At least 2 teams are required")
      .max(20, "Maximum 20 teams")
      .refine((ids) => new Set(ids).size === ids.length, "Teams must be distinct"),
    rounds: z.coerce.number().int().min(1, "At least 1 round required").max(4, "Maximum 4 rounds").default(1),
    startDate: z.coerce.date({ message: "Valid start date is required" }),
    endDate: z.coerce.date({ message: "Valid end date is required" }),
    eligibleDays: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Select at least one game day"),
    startTime: timeStringSchema,
    gameDurationMinutes: z.coerce.number().int().min(30).max(300).default(90),
    defaultVenueId: optionalCuid("Invalid venue ID format"),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const createGameProposalSchema = z
  .object({
    proposingTeamId: z.string().cuid("Invalid team ID format"),
    receivingTeamId: z.string().cuid("Invalid team ID format"),
    seasonId: optionalCuid("Invalid season ID format"),
    startAt: z.coerce.date({ message: "Valid start time is required" }),
    endAt: z.coerce.date({ message: "Valid end time is required" }),
    venueId: optionalCuid("Invalid venue ID format"),
    note: optionalSanitizedString(1000),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "End time must be after the start time",
    path: ["endAt"],
  })
  .refine((data) => data.proposingTeamId !== data.receivingTeamId, {
    message: "A team cannot propose a game against itself",
    path: ["receivingTeamId"],
  });

export const counterGameProposalSchema = z
  .object({
    proposalId: z.string().cuid("Invalid proposal ID format"),
    startAt: z.coerce.date({ message: "Valid start time is required" }),
    endAt: z.coerce.date({ message: "Valid end time is required" }),
    venueId: optionalCuid("Invalid venue ID format"),
    note: optionalSanitizedString(1000),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "End time must be after the start time",
    path: ["endAt"],
  });

export const acceptGameProposalSchema = z.object({
  proposalId: z.string().cuid("Invalid proposal ID format"),
  overrideConflicts: z.boolean().default(false),
});

export const declineGameProposalSchema = z.object({
  proposalId: z.string().cuid("Invalid proposal ID format"),
  reason: optionalSanitizedString(500),
});

export const recordPlacementSchema = z.object({
  seasonId: z.string().cuid("Invalid season ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
  divisionId: optionalCuid("Invalid division ID format").nullable(),
  rank: optionalPositiveInt("Rank must be a positive number", 999),
  privateNote: optionalSanitizedString(2000),
});

export type CreateSeasonInput = z.input<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.input<typeof updateSeasonSchema>;
export type CreateSeasonPhaseInput = z.input<typeof createSeasonPhaseSchema>;
export type UpdateSeasonPhaseInput = z.input<typeof updateSeasonPhaseSchema>;
export type CreateSeasonGameInput = z.input<typeof createSeasonGameSchema>;
export type UpdateSeasonGameInput = z.input<typeof updateSeasonGameSchema>;
export type PublishSeasonGamesInput = z.input<typeof publishSeasonGamesSchema>;
export type RecordSeasonGameScoreInput = z.input<typeof recordSeasonGameScoreSchema>;
export type CheckGameConflictsInput = z.input<typeof checkGameConflictsSchema>;
export type GenerateRoundRobinInput = z.input<typeof generateRoundRobinSchema>;
export type CreateGameProposalInput = z.input<typeof createGameProposalSchema>;
export type CounterGameProposalInput = z.input<typeof counterGameProposalSchema>;
export type AcceptGameProposalInput = z.input<typeof acceptGameProposalSchema>;
export type DeclineGameProposalInput = z.input<typeof declineGameProposalSchema>;
export type RecordPlacementInput = z.input<typeof recordPlacementSchema>;

// --- Surface segmentation & venue layout (feature 006) ---

// Normalized (0-1) coordinate on a surface or venue schematic.
const normalizedCoordinate = z.coerce
  .number()
  .min(0, "Coordinates must be between 0 and 1")
  .max(1, "Coordinates must be between 0 and 1");

const rotationDegrees = z.coerce
  .number()
  .min(0, "Rotation must be at least 0 degrees")
  .lt(360, "Rotation must be less than 360 degrees");

/** Normalized rect on the schematic: {x, y, w, h, rotation} (data-model 006). */
export const segmentGeometrySchema = z.object({
  x: normalizedCoordinate,
  y: normalizedCoordinate,
  w: normalizedCoordinate,
  h: normalizedCoordinate,
  rotation: rotationDegrees,
});

/** Staff-confirmed coexistence pair; canonicalized (A < B) server-side. */
const coexistencePairSchema = z.object({
  segmentAId: z.string().cuid("Invalid segment ID format"),
  segmentBId: z.string().cuid("Invalid segment ID format"),
});

export const createSegmentSchema = z.object({
  surfaceId: z.string().cuid("Invalid surface ID format"),
  name: sanitizedStringWithMin(1, 80),
  geometry: segmentGeometrySchema,
  // Only confirmed pairs coexist; undeclared pairs conflict (safe default).
  confirmedCoexistence: z.array(coexistencePairSchema).default([]),
});

export const updateSegmentSchema = z.object({
  segmentId: z.string().cuid("Invalid segment ID format"),
  name: sanitizedStringWithMin(1, 80).optional(),
  geometry: segmentGeometrySchema.optional(),
  confirmedCoexistence: z.array(coexistencePairSchema).optional(),
  // Coexistence edits that create new conflicts require explicit confirmation
  // after the server returns the newly conflicting bookings (FR-007).
  confirm: z.boolean().default(false),
});

export const applySegmentationPresetSchema = z.object({
  surfaceId: z.string().cuid("Invalid surface ID format"),
});

export const setSegmentActiveSchema = z.object({
  segmentId: z.string().cuid("Invalid segment ID format"),
  isActive: z.boolean(),
});

/** Rename the implicit whole-surface segment; empty resets to the type default. */
export const setWholeSurfaceLabelSchema = z.object({
  surfaceId: z.string().cuid("Invalid surface ID format"),
  wholeLabel: optionalSanitizedString(60),
});

/** Pure read: drawn geometry → suggested coexistence pairs for staff review. */
export const suggestCoexistenceSchema = z.object({
  surfaceId: z.string().cuid("Invalid surface ID format"),
  geometry: segmentGeometrySchema,
  excludeSegmentId: optionalCuid("Invalid segment ID format"),
});

/** Venue schematic layout (FR-016-018). Presentational only. */
export const saveVenueLayoutSchema = z.object({
  venueId: z.string().cuid("Invalid venue ID format"),
  layout: z.object({
    surfaces: z.array(
      segmentGeometrySchema.extend({
        surfaceId: z.string().cuid("Invalid surface ID format"),
      })
    ),
    labels: z
      .array(
        z.object({
          text: sanitizedStringWithMin(1, 40),
          x: normalizedCoordinate,
          y: normalizedCoordinate,
        })
      )
      .max(20, "A layout can have at most 20 labels"),
  }),
});

export type SegmentGeometryInput = z.input<typeof segmentGeometrySchema>;
export type CreateSegmentInput = z.input<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.input<typeof updateSegmentSchema>;
export type ApplySegmentationPresetInput = z.input<typeof applySegmentationPresetSchema>;
export type SetSegmentActiveInput = z.input<typeof setSegmentActiveSchema>;
export type SetWholeSurfaceLabelInput = z.input<typeof setWholeSurfaceLabelSchema>;
export type SuggestCoexistenceInput = z.input<typeof suggestCoexistenceSchema>;
export type SaveVenueLayoutInput = z.input<typeof saveVenueLayoutSchema>;
