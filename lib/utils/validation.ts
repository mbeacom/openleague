import { z } from "zod";

// Helper for optional string fields that allow empty string
function optionalString(schema: z.ZodString) {
  return schema.optional().or(z.literal(""));
}

// Auth validation schemas
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters"),
  name: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Team validation schemas
export const createTeamSchema = z.object({
  name: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name must be less than 100 characters"),
  sport: z
    .string()
    .min(1, "Sport is required")
    .max(50, "Sport must be less than 50 characters"),
  season: z
    .string()
    .min(1, "Season is required")
    .max(50, "Season must be less than 50 characters"),
});

// Player validation schemas
export const addPlayerSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: optionalString(z.string().email("Invalid email address")),
  phone: optionalString(z.string().max(20, "Phone must be less than 20 characters")),
  emergencyContact: optionalString(
    z.string().max(100, "Emergency contact must be less than 100 characters")
  ),
  emergencyPhone: optionalString(
    z.string().max(20, "Emergency phone must be less than 20 characters")
  ),
  teamId: z.string().min(1, "Team ID is required"),
});

export const updatePlayerSchema = addPlayerSchema.extend({
  id: z.string().min(1, "Player ID is required"),
});

// Event validation schemas
const baseEventSchema = z.object({
  type: z.enum(["GAME", "PRACTICE"], {
    message: "Event type must be GAME or PRACTICE",
  }),
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be less than 100 characters"),
  startAt: z.coerce.date({
    message: "Valid date and time is required",
  }),
  location: z
    .string()
    .min(1, "Location is required")
    .max(200, "Location must be less than 200 characters"),
  opponent: z
    .string()
    .max(100, "Opponent must be less than 100 characters")
    .optional()
    .nullable(),
  notes: z
    .string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional()
    .nullable(),
  teamId: z.string().min(1, "Team ID is required"),
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
    id: z.string().min(1, "Event ID is required"),
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
  eventId: z.string().min(1, "Event ID is required"),
  status: z.enum(["GOING", "NOT_GOING", "MAYBE"], {
    message: "RSVP status must be GOING, NOT_GOING, or MAYBE",
  }),
});

// Invitation validation schemas
export const sendInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  teamId: z.string().min(1, "Team ID is required"),
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
