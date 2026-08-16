import { Prisma } from "@prisma/client";
import { isRetryablePrismaConflict } from "@/lib/utils/gear";

const MAX_ATTEMPTS = 3;

export class GearConflictError extends Error {
  constructor(message = "Inventory changed while saving. Please review the latest inventory and try again.") {
    super(message);
    this.name = "GearConflictError";
  }
}

export async function withGearSerializableRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryablePrismaConflict(error) || attempt === MAX_ATTEMPTS) {
        if (isRetryablePrismaConflict(error)) {
          throw new GearConflictError();
        }
        throw error;
      }
    }
  }

  throw new GearConflictError();
}

export const gearTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
};
