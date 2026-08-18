import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 25;
const RETRY_MAX_DELAY_MS = 250;

export type VenueReservationRetryDependencies = {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

export class VenueReservationContentionError extends Error {
  constructor(
    message = "The venue reservation changed while saving. Review current availability and try again.",
    readonly retryExhausted = false,
  ) {
    super(message);
    this.name = "VenueReservationContentionError";
  }
}

export function isRetryableVenueReservationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2034" || error.code === "P2028")
  );
}

export async function withVenueReservationSerializableRetry<T>(
  run: () => Promise<T>,
  dependencies: VenueReservationRetryDependencies = {},
): Promise<T> {
  const sleep =
    dependencies.sleep
    ?? ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = dependencies.random ?? Math.random;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const retryable = isRetryableVenueReservationConflict(error);
      if (!retryable) throw error;
      if (attempt === MAX_ATTEMPTS) {
        throw new VenueReservationContentionError(undefined, true);
      }

      const exponentialDelay = Math.min(
        RETRY_MAX_DELAY_MS,
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      const jitter = Math.floor(
        Math.max(0, Math.min(1, random())) * RETRY_BASE_DELAY_MS,
      );
      await sleep(Math.min(RETRY_MAX_DELAY_MS, exponentialDelay + jitter));
    }
  }

  throw new VenueReservationContentionError(undefined, true);
}

export const venueReservationTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
};

export async function runVenueReservationTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withVenueReservationSerializableRetry(async () => {
    const transaction = prisma.$transaction(work, venueReservationTransactionOptions);
    // Keep lightweight action-test Prisma doubles usable when they do not
    // implement the callback transaction API.
    if (transaction && typeof transaction.then === "function") {
      return transaction;
    }
    return work(prisma as unknown as Prisma.TransactionClient);
  });
}
