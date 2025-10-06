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

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        passwordHash,
        name: validated.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // If there's an invitation token, process it
    if (data.invitationToken) {
      try {
        const invitation = await prisma.invitation.findUnique({
          where: { token: data.invitationToken },
        });

        if (invitation && invitation.status === "PENDING" && invitation.expiresAt > new Date()) {
          // Add user to team as MEMBER
          await prisma.teamMember.create({
            data: {
              userId: user.id,
              teamId: invitation.teamId,
              role: "MEMBER",
            },
          });

          // Update invitation status to ACCEPTED
          await prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: "ACCEPTED" },
          });
        }
      } catch (error) {
        console.error("Error processing invitation during signup:", error);
        // Don't fail signup if invitation processing fails
      }
    }

    return { success: true, data: user };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: "Invalid input", details: error.issues };
    }
    console.error("Signup error:", error);
    return { error: "An unexpected error occurred during signup" };
  }
}
