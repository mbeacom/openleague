import { z } from "zod";

// Create base schema without refinements for extension
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

// Create refined schema with shared validation logic (DRY principle)
const refinedEventSchema = baseEventSchema
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

export const createEventSchema = refinedEventSchema;

export const updateEventSchema = refinedEventSchema.extend({
  id: z.string().min(1, "Event ID is required"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
