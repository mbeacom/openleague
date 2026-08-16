import { describe, expect, it, vi } from "vitest";
import { GearConflictError, withGearSerializableRetry } from "@/lib/services/gear-transaction";

describe("gear serializable retries", () => {
  it("uses bounded exponential backoff with deterministic jitter between retryable attempts", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockRejectedValueOnce({ code: "P2034" })
      .mockResolvedValueOnce("saved");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withGearSerializableRetry(run, { sleep, random: () => 0.5 })).resolves.toBe("saved");

    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(37);
    expect(sleep).toHaveBeenCalledWith(62);
  });

  it("returns a user-safe conflict after the retry budget is exhausted", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withGearSerializableRetry(
      () => Promise.reject({ code: "P2034" }),
      { sleep, random: () => 0 },
    )).rejects.toEqual(expect.objectContaining({ retryExhausted: true }));
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(GearConflictError).toBeDefined();
  });
});
