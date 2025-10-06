import { z } from "zod";

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

// Invitation validation schemas
export const sendInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  teamId: z.string().min(1, "Team ID is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type SendInvitationInput = z.infer<typeof sendInvitationSchema>;
