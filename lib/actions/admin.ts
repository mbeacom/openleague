"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/session";
import { z } from "zod";

/**
 * Check if a user has admin privileges (system-wide)
 * For now, this checks if user is a LEAGUE_ADMIN in any league
 * In future, could add a separate system admin role
 */
async function isSystemAdmin(userId: string): Promise<boolean> {
  const adminCount = await prisma.leagueUser.count({
    where: {
      userId,
      role: "LEAGUE_ADMIN",
    },
  });

  return adminCount > 0;
}

/**
 * Get all pending user approvals
 * Only accessible by system admins
 */
export async function getPendingApprovals() {
  try {
    const session = await requireAuth();
    if (!session.user?.id) {
      throw new Error("Unauthorized");
    }

    // Check if user is system admin
    const isAdmin = await isSystemAdmin(session.user.id);
    if (!isAdmin) {
      return { error: "Unauthorized: Admin access required" };
    }

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
    const session = await requireAuth();
    if (!session.user?.id) {
      throw new Error("Unauthorized");
    }

    // Validate input
    const userIdSchema = z.string().cuid("Invalid user ID format");
    const validatedUserId = userIdSchema.parse(userId);

    // Check if user is system admin
    const isAdmin = await isSystemAdmin(session.user.id);
    if (!isAdmin) {
      return { error: "Unauthorized: Admin access required" };
    }

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
    const session = await requireAuth();
    if (!session.user?.id) {
      throw new Error("Unauthorized");
    }

    // Validate input
    const userIdSchema = z.string().cuid("Invalid user ID format");
    const validatedUserId = userIdSchema.parse(userId);

    // Check if user is system admin
    const isAdmin = await isSystemAdmin(session.user.id);
    if (!isAdmin) {
      return { error: "Unauthorized: Admin access required" };
    }

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
    const session = await requireAuth();
    if (!session.user?.id) {
      throw new Error("Unauthorized");
    }

    // Check if user is system admin
    const isAdmin = await isSystemAdmin(session.user.id);
    if (!isAdmin) {
      return { error: "Unauthorized: Admin access required" };
    }

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
