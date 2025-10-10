"use server";

import { prisma } from "@/lib/db/prisma";
import { requireSystemAdmin } from "@/lib/auth/session";
import { z } from "zod";

/**
 * Get all pending user approvals
 * Only accessible by system admins
 */
export async function getPendingApprovals() {
  try {
    await requireSystemAdmin();

    const pendingUsers = await prisma.user.findMany({
      where: {
        approved: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: pendingUsers };
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    return { error: "Failed to fetch pending approvals" };
  }
}

/**
 * Approve a user account
 * Only accessible by system admins
 */
export async function approveUser(userId: string) {
  try {
    await requireSystemAdmin();

    // Validate input
    const userIdSchema = z.string().cuid("Invalid user ID format");
    const validatedUserId = userIdSchema.parse(userId);

    // Update user approval status
    const updatedUser = await prisma.user.update({
      where: { id: validatedUserId },
      data: { approved: true },
      select: {
        id: true,
        email: true,
        name: true,
        approved: true,
      },
    });

    return { success: true, data: updatedUser };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid user ID format" };
    }
    console.error("Error approving user:", error);
    return { error: "Failed to approve user" };
  }
}

/**
 * Reject (delete) a pending user account
 * Only accessible by system admins
 */
export async function rejectUser(userId: string) {
  try {
    await requireSystemAdmin();

    // Validate input
    const userIdSchema = z.string().cuid("Invalid user ID format");
    const validatedUserId = userIdSchema.parse(userId);

    // Check if user is actually pending (not approved)
    const user = await prisma.user.findUnique({
      where: { id: validatedUserId },
      select: { approved: true },
    });

    if (!user) {
      return { error: "User not found" };
    }

    if (user.approved) {
      return { error: "Cannot reject an already approved user" };
    }

    // Delete the user account
    await prisma.user.delete({
      where: { id: validatedUserId },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid user ID format" };
    }
    console.error("Error rejecting user:", error);
    return { error: "Failed to reject user" };
  }
}

/**
 * Get all users with their approval status
 * Only accessible by system admins
 */
export async function getAllUsers() {
  try {
    await requireSystemAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        approved: true,
        createdAt: true,
        _count: {
          select: {
            teamMembers: true,
            leagueUsers: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: users };
  } catch (error) {
    console.error("Error fetching all users:", error);
    return { error: "Failed to fetch users" };
  }
}
