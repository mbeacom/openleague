import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  VenueReservationContentionError,
  venueReservationTransactionOptions,
  withVenueReservationSerializableRetry,
} from "@/lib/services/venue-reservation-transaction";

function prismaConflict(code: string) {
  return new Prisma.PrismaClientKnownRequestError("transaction conflict", {
    code,
    clientVersion: "7.9.1",
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
});
