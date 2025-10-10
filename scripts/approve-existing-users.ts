import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Script to approve all existing users
 * Run this once after deploying the approval feature to approve all existing users
 *
 * Usage: bun run tsx scripts/approve-existing-users.ts
 */
async function approveExistingUsers() {
  try {
    console.log("🔍 Finding unapproved users...");

    const unapprovedUsers = await prisma.user.findMany({
      where: {
        approved: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    console.log(`📋 Found ${unapprovedUsers.length} unapproved users`);

    if (unapprovedUsers.length === 0) {
      console.log("✅ All users are already approved!");
      return;
    }

    console.log("\n📝 Approving users:");
    unapprovedUsers.forEach((user) => {
      console.log(`  - ${user.email} (${user.name || "No name"})`);
    });

    console.log("\n⚡ Approving all existing users...");

    const result = await prisma.user.updateMany({
      where: {
        approved: false,
      },
      data: {
        approved: true,
      },
    });

    console.log(`\n✅ Successfully approved ${result.count} users!`);
  } catch (error) {
    console.error("❌ Error approving users:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

approveExistingUsers();
