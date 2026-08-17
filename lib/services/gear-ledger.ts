import type {
  GearActivityActorKind,
  GearActivityEntityType,
  GearCondition,
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
  actorUserId?: string | null;
  actorKind?: GearActivityActorKind;
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
  allocationId?: string | null;
  handoffId?: string | null;
  pledgeReceiptId?: string | null;
  beforeLocationId?: string | null;
  afterLocationId?: string | null;
  beforeCondition?: GearCondition | null;
  afterCondition?: GearCondition | null;
  notes?: string | null;
};

/** Ledger helpers are intentionally plain functions so mutations can include them atomically. */
export async function recordGearActivity(
  tx: GearTransaction,
  input: GearActivityInput,
): Promise<void> {
  const actorKind = input.actorKind ?? "USER";
  if (actorKind === "USER" && !input.actorUserId) {
    throw new Error("User activity requires an actor.");
  }
  const details = gearActivityDetailsSchema.parse({
    action: input.action,
    ...input.details,
  });
  await tx.gearActivity.create({
    data: {
      ...input,
      details,
      actorKind,
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
