import type { GearActivityEntityType, GearInventoryMovementType, Prisma } from "@prisma/client";

type GearTransaction = Prisma.TransactionClient;

export type GearActivityInput = {
  leagueId: string;
  entityType: GearActivityEntityType;
  entityId: string;
  action: string;
  actorUserId: string;
  details?: Prisma.InputJsonValue;
};

export type GearMovementInput = {
  leagueId: string;
  type: GearInventoryMovementType;
  quantity: number;
  recordedById: string;
  poolStockId?: string | null;
  gearUnitId?: string | null;
  beforeLocationId?: string | null;
  afterLocationId?: string | null;
  beforeCondition?: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | null;
  afterCondition?: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | null;
  notes?: string | null;
};

/** Ledger helpers are intentionally plain functions so mutations can include them atomically. */
export async function recordGearActivity(
  tx: GearTransaction,
  input: GearActivityInput,
): Promise<void> {
  await tx.gearActivity.create({
    data: {
      ...input,
      actorKind: "USER",
    },
  });
}

export async function recordGearInventoryMovement(
  tx: GearTransaction,
  input: GearMovementInput,
): Promise<void> {
  await tx.gearInventoryMovement.create({ data: input });
}
