"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema, type SignupInput } from "@/lib/utils/validation";
import { ZodError } from "zod";

export interface SignupWithInvitationInput extends SignupInput {
  invitationToken?: string;
}

export async function signup(data: SignupWithInvitationInput) {
  try {
    // Validate input
    const validated = signupSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return { error: "An account with this email already exists" };
    }

    // Hash password with bcrypt (cost factor 12)
    const passwordHash = await hash(validated.password, 12);

    // Create user with approved: false (pending approval)
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        passwordHash,
        name: validated.name,
        approved: false, // Require admin approval
      },
      select: {
        id: true,
        email: true,
        name: true,
        approved: true,
      },
    });

    // If there's an invitation token, process it
    if (data.invitationToken) {
      try {
        const invitation = await prisma.invitation.findUnique({
          where: { token: data.invitationToken },
        });

        if (invitation && invitation.status === "PENDING" && invitation.expiresAt > new Date()) {
          // Use transaction to ensure atomicity
          await prisma.$transaction([
            // Add user to team as MEMBER
            prisma.teamMember.create({
              data: {
                userId: user.id,
                teamId: invitation.teamId,
                role: "MEMBER",
              },
            }),
            // Update invitation status to ACCEPTED
            prisma.invitation.update({
              where: { id: invitation.id },
              data: { status: "ACCEPTED" },
            }),
          ]);
        }
      } catch (inviteError) {
        console.error("Error processing invitation during signup:", inviteError);
        // Don't fail signup if invitation processing fails
      }
    }

    // Return a clean, serializable success response
    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        approved: user.approved,
      }
    };
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return {
        error: "Invalid input",
        details: error.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
        }))
      };
    }

    // Log the full error for debugging
    console.error("Signup error:", error);

    // Return a clean, serializable error response
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during signup";
    return { error: errorMessage };
  }
}
