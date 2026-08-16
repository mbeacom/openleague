import type { Prisma } from "@prisma/client";

type GearTransaction = Prisma.TransactionClient;

/**
 * Account deletion must not turn a captured user address into an anonymous
 * recipient. Cancel unsent rows and replace their destination before removing
 * the user relation in the same transaction as the account deletion.
 */
export async function cancelGearOutboxForDeletedUser(
  tx: GearTransaction,
  userId: string,
): Promise<void> {
  await tx.notificationOutbox.updateMany({
    where: {
      recipientUserId: userId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: "CANCELED",
      recipientUserId: null,
      recipientEmail: "redacted-recipient@invalid",
      recipientRedactedAt: new Date(),
      lockedAt: null,
      lastError: "Recipient account deleted",
    },
  });
}
