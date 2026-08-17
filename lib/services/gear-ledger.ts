import type {
  GearActivityEntityType,
  GearInventoryDirection,
  GearInventoryMovementType,
  Prisma,
} from "@prisma/client";
import type { GearActivityDetails } from "@/types/gear";
import {
  gearActivityDetailsSchema,
  recordGearInventoryMovementSchema,
} from "@/lib/utils/validation";

type GearTransaction = Prisma.TransactionClient;

export type GearActivityInput = {
  leagueId: string;
  entityType: GearActivityEntityType;
  entityId: string;
  action: string;
  actorUserId: string;
  details?: Omit<GearActivityDetails, "action">;
};

export type GearMovementInput = {
  leagueId: string;
  type: GearInventoryMovementType;
  direction: GearInventoryDirection;
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
  const details = gearActivityDetailsSchema.parse({
    action: input.action,
    ...input.details,
  });
  await tx.gearActivity.create({
    data: {
      ...input,
      details,
      actorKind: "USER",
    },
  });
}

export async function recordGearInventoryMovement(
  tx: GearTransaction,
  input: GearMovementInput,
): Promise<void> {
  recordGearInventoryMovementSchema.parse({
    leagueId: input.leagueId,
    type: input.type,
    direction: input.direction,
    poolStockId: input.poolStockId ?? "",
    gearUnitId: input.gearUnitId ?? "",
    quantity: input.quantity,
    notes: input.notes ?? undefined,
  });
  await tx.gearInventoryMovement.create({ data: input });
}
