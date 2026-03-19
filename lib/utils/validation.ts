import { z } from "zod";

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
  endAt: z.coerce.date({
    message: "Valid end date and time is required",
  }).optional(),
  location: sanitizedStringWithMin(1, 200).refine(val => val.length > 0, "Location is required"),
  venueId: z.string().cuid("Invalid venue ID format").optional().or(z.literal("")),
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
  surfaceType: z.enum(["ICE", "TURF", "COURT", "FIELD", "OTHER"], {
    message: "Surface type must be ICE, TURF, COURT, FIELD, or OTHER",
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
  surfaceType: z.enum(["ICE", "TURF", "COURT", "FIELD", "OTHER"]).default("OTHER"),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
  amenities: z.array(z.string().max(50)).max(20).default([]),
  phone: optionalSanitizedString(20),
  website: optionalSanitizedString(500),
  notes: optionalSanitizedString(1000),
  visibility: z.enum(["PUBLIC", "LEAGUE", "TEAM"]).default("PUBLIC"),
  teamId: z.string().cuid("Invalid team ID format").optional().or(z.literal("")),
  leagueId: z.string().cuid("Invalid league ID format").optional().or(z.literal("")),
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

// Game schedule validation schemas
export const createGameScheduleSchema = z.object({
  name: sanitizedStringWithMin(1, 100),
  seasonName: optionalSanitizedString(100),
  startDate: z.coerce.date({ message: "Valid start date is required" }),
  endDate: z.coerce.date({ message: "Valid end date is required" }),
  roundRobin: z.boolean().default(true),
  rounds: z.number().int().min(1, "At least 1 round required").max(4, "Maximum 4 rounds").default(1),
  notes: optionalSanitizedString(1000),
  leagueId: z.string().cuid("Invalid league ID format").optional().or(z.literal("")),
  teamId: z.string().cuid("Invalid team ID format").optional().or(z.literal("")),
  // Teams participating in the schedule
  teamIds: z.array(z.string().cuid("Invalid team ID format")).min(2, "At least 2 teams are required"),
  // Venues to rotate through
  venueIds: z.array(z.string().cuid("Invalid venue ID format")).min(1, "At least 1 venue is required"),
  // Scheduling preferences
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 0=Sunday, 6=Saturday
  preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/, "Time format must be HH:MM").optional(),
  gameDurationMinutes: z.number().int().min(30).max(300).default(90),
}).refine(
  (data) => data.endDate > data.startDate,
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
);

export const generateScheduleGamesSchema = z.object({
  gameScheduleId: z.string().cuid("Invalid schedule ID format"),
  overrideConflicts: z.boolean().default(false),
});

export const publishScheduleSchema = z.object({
  gameScheduleId: z.string().cuid("Invalid schedule ID format"),
});

export const updateScheduleGameSchema = z.object({
  scheduleGameId: z.string().cuid("Invalid schedule game ID format"),
  startAt: z.coerce.date({ message: "Valid start date is required" }).optional(),
  endAt: z.coerce.date({ message: "Valid end date is required" }).optional(),
  venueId: z.string().cuid("Invalid venue ID format").optional(),
  overrideConflicts: z.boolean().default(false),
});

// Venue & schedule type exports
export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
export type VenueAvailabilityInput = z.infer<typeof venueAvailabilitySchema>;
export type CreateGameScheduleInput = z.infer<typeof createGameScheduleSchema>;
export type GenerateScheduleGamesInput = z.infer<typeof generateScheduleGamesSchema>;
export type PublishScheduleInput = z.infer<typeof publishScheduleSchema>;
export type UpdateScheduleGameInput = z.infer<typeof updateScheduleGameSchema>;

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
});

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
});

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

export type CreatePracticeSessionInput = z.infer<typeof createPracticeSessionSchema>;
export type UpdatePracticeSessionInput = z.infer<typeof updatePracticeSessionSchema>;
export type DeletePracticeSessionInput = z.infer<typeof deletePracticeSessionSchema>;
export type GetPracticeSessionByIdInput = z.infer<typeof getPracticeSessionByIdSchema>;
export type GetPracticeSessionsByTeamInput = z.infer<typeof getPracticeSessionsByTeamSchema>;
export type SharePracticeSessionInput = z.infer<typeof sharePracticeSessionSchema>;
