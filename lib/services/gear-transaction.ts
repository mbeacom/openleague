import { Prisma } from "@prisma/client";
import { isRetryablePrismaConflict } from "@/lib/utils/gear";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 25;
const RETRY_MAX_DELAY_MS = 250;

export type GearRetryDependencies = {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

export class GearConflictError extends Error {
  constructor(
    message = "Inventory changed while saving. Please review the latest inventory and try again.",
    readonly retryExhausted = false,
  ) {
    super(message);
    this.name = "GearConflictError";
  }
}

export async function withGearSerializableRetry<T>(
  run: () => Promise<T>,
  dependencies: GearRetryDependencies = {},
): Promise<T> {
  const sleep = dependencies.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = dependencies.random ?? Math.random;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryablePrismaConflict(error) || attempt === MAX_ATTEMPTS) {
        if (isRetryablePrismaConflict(error)) {
          throw new GearConflictError(undefined, true);
        }
        throw error;
      }
      const exponentialDelay = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)));
      const jitter = Math.floor(Math.max(0, Math.min(1, random())) * RETRY_BASE_DELAY_MS);
      await sleep(Math.min(RETRY_MAX_DELAY_MS, exponentialDelay + jitter));
    }
  }

  throw new GearConflictError();
}

export const gearTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
};
