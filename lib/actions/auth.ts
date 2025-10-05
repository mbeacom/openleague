"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema, type SignupInput } from "@/lib/utils/validation";
import { ZodError } from "zod";

export async function signup(data: SignupInput) {
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

    return { success: true, data: user };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: "Invalid input", details: error.issues };
    }
    console.error("Signup error:", error);
    return { error: "An unexpected error occurred during signup" };
  }
}
