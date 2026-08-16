import type { Prisma } from "@prisma/client";
import { recordGearActivity } from "@/lib/services/gear-ledger";
import { queueGearOutboxForLeagueAdmins } from "@/lib/services/gear-outbox";
import { GearConflictError } from "@/lib/services/gear-transaction";

type GearTransaction = Prisma.TransactionClient;

type TerminalPledge = {
  id: string;
  leagueId: string;
  wishlistItemId: string;
  status: "RECEIVED" | "DECLINED" | "CANCELED" | "EXPIRED";
  version: number;
  piiRedactionStatus: "PENDING" | "REDACTED";
};

/**
 * Shared by the administrator action and future retention scheduling. This
 * deliberately changes only mutable PII projections; the custody ledger stays
 * immutable and carries no donor data.
 */
export async function redactTerminalGearPledgePii(
  tx: GearTransaction,
  pledge: TerminalPledge,
  actorUserId?: string,
): Promise<{ id: string; version: number }> {
  if (pledge.piiRedactionStatus === "REDACTED") {
    return { id: pledge.id, version: pledge.version };
  }
  const update = await tx.gearPledge.updateMany({
    where: {
      id: pledge.id,
      leagueId: pledge.leagueId,
      version: pledge.version,
      piiRedactionStatus: "PENDING",
    },
    data: {
      donorName: null,
      donorEmail: null,
      donorPhone: null,
      contactConsentAt: null,
      note: null,
      piiRedactionStatus: "REDACTED",
      piiRedactedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (update.count !== 1) throw new GearConflictError();

  await recordGearActivity(tx, {
    leagueId: pledge.leagueId,
    entityType: "PLEDGE",
    entityId: pledge.id,
    action: "pii_redacted",
    actorKind: actorUserId ? "USER" : "SYSTEM",
    actorUserId,
    details: { metadata: { wishlistItemId: pledge.wishlistItemId, terminalStatus: pledge.status } },
  });
  await queueGearOutboxForLeagueAdmins(tx, {
    leagueId: pledge.leagueId,
    eventType: "gear.pledge.pii_redacted",
    occurrenceKey: `v${pledge.version + 1}`,
    aggregateType: "PLEDGE",
    aggregateId: pledge.id,
    payload: {
      kind: "GEAR_PLEDGE",
      data: { pledgeId: pledge.id, wishlistItemId: pledge.wishlistItemId, status: pledge.status },
    },
  });
  return { id: pledge.id, version: pledge.version + 1 };
}
