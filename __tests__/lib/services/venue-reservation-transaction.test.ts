import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { DriverAdapterError } from "@prisma/driver-adapter-utils";
import {
  VenueReservationContentionError,
  isRetryableVenueReservationConflict,
  venueReservationTransactionOptions,
  withVenueReservationSerializableRetry,
} from "@/lib/services/venue-reservation-transaction";

function prismaConflict(code: string) {
  return new Prisma.PrismaClientKnownRequestError("transaction conflict", {
    code,
    clientVersion: "7.9.1",
  });
}

// The pg and Neon adapters throw this exact class when COMMIT fails, and
// Prisma does not rewrap that path. Building it from the real class means a
// change to its shape in a Prisma upgrade breaks these tests.
function postgresError(code: string) {
  return new DriverAdapterError({
    kind: "postgres",
    code,
    severity: "ERROR",
    message: `sqlstate ${code}`,
    detail: undefined,
    column: undefined,
    hint: undefined,
  });
}

describe("venue reservation serializable retry", () => {
  it("uses a short serializable transaction budget", () => {
    expect(venueReservationTransactionOptions).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    });
  });

  it("retries bounded serialization and write conflicts", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(prismaConflict("P2034"))
      .mockRejectedValueOnce(prismaConflict("P2028"))
      .mockResolvedValue("committed");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withVenueReservationSerializableRetry(run, {
      sleep,
      random: () => 0,
    })).resolves.toBe("committed");

    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("returns a friendly typed contention error after the retry budget", async () => {
    const run = vi.fn().mockRejectedValue(prismaConflict("P2034"));

    await expect(withVenueReservationSerializableRetry(run, {
      sleep: async () => undefined,
      random: () => 0,
    })).rejects.toMatchObject({
      name: "VenueReservationContentionError",
      retryExhausted: true,
      message: expect.stringContaining("reservation"),
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-contention failures", async () => {
    const failure = new Error("validation failed");
    const run = vi.fn().mockRejectedValue(failure);

    await expect(withVenueReservationSerializableRetry(run)).rejects.toBe(failure);
    expect(run).toHaveBeenCalledOnce();
    expect(failure).not.toBeInstanceOf(VenueReservationContentionError);
  });

  it("retries a serialization failure raised by COMMIT through the driver adapter", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new DriverAdapterError({
        kind: "TransactionWriteConflict",
        originalCode: "40001",
        originalMessage: "could not serialize access due to read/write dependencies among transactions",
      }))
      .mockResolvedValue("committed");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withVenueReservationSerializableRetry(run, {
      sleep,
      random: () => 0,
    })).resolves.toBe("committed");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("surfaces exhausted adapter-level conflicts as the typed contention error", async () => {
    const run = vi.fn().mockRejectedValue(
      new DriverAdapterError({ kind: "TransactionWriteConflict" }),
    );

    await expect(withVenueReservationSerializableRetry(run, {
      sleep: async () => undefined,
      random: () => 0,
    })).rejects.toBeInstanceOf(VenueReservationContentionError);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("classifies only serialization and deadlock adapter failures as retryable", () => {
    expect(isRetryableVenueReservationConflict(
      new DriverAdapterError({ kind: "TransactionWriteConflict" }),
    )).toBe(true);
    expect(isRetryableVenueReservationConflict(
      postgresError("40P01"),
    )).toBe(true);
    expect(isRetryableVenueReservationConflict(
      new DriverAdapterError({ kind: "UniqueConstraintViolation", originalCode: "23505" }),
    )).toBe(false);
    expect(isRetryableVenueReservationConflict(
      postgresError("23P01"),
    )).toBe(false);
    expect(isRetryableVenueReservationConflict(prismaConflict("P2002"))).toBe(false);
    expect(isRetryableVenueReservationConflict(
      Object.assign(new Error("x"), { cause: { kind: "TransactionWriteConflict" } }),
    )).toBe(false);
  });
});
