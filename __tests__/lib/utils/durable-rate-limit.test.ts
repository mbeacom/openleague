import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimitBucket: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  headers: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { rateLimitBucket: mocks.rateLimitBucket },
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

import {
  checkRateLimit,
  getClientIp,
  rateLimitMessage,
  RATE_LIMITS,
} from "@/lib/utils/durable-rate-limit";

const OPTS = { limit: 5, windowSec: 900 };

let randomSpy: MockInstance<() => number>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimitBucket.upsert.mockResolvedValue({ count: 1 });
  mocks.rateLimitBucket.deleteMany.mockResolvedValue({ count: 0 });
  mocks.headers.mockResolvedValue(new Headers());
  // Keep opportunistic cleanup out of tests that don't target it.
  randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  randomSpy.mockRestore();
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    mocks.rateLimitBucket.upsert.mockResolvedValue({ count: 3 });
    const result = await checkRateLimit("signup:ip:1.2.3.4", OPTS);
    expect(result).toEqual({ allowed: true });
  });

  it("allows the request that exactly reaches the limit", async () => {
    mocks.rateLimitBucket.upsert.mockResolvedValue({ count: 5 });
    const result = await checkRateLimit("signup:ip:1.2.3.4", OPTS);
    expect(result).toEqual({ allowed: true });
  });

  it("blocks once the count exceeds the limit and reports retryAfterSec", async () => {
    mocks.rateLimitBucket.upsert.mockResolvedValue({ count: 6 });
    const result = await checkRateLimit("signup:ip:1.2.3.4", OPTS);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSec).toBeLessThanOrEqual(OPTS.windowSec);
  });

  it("counts in a single atomic upsert keyed by (key, windowStart)", async () => {
    await checkRateLimit("invite:user:u1", OPTS);

    const args = mocks.rateLimitBucket.upsert.mock.calls[0][0];
    expect(args.where.key_windowStart.key).toBe("invite:user:u1");
    expect(args.where.key_windowStart.windowStart).toBeInstanceOf(Date);
    // create omits count (defaults to 1); update increments atomically.
    expect(args.create).toEqual({
      key: "invite:user:u1",
      windowStart: args.where.key_windowStart.windowStart,
      expiresAt: expect.any(Date),
    });
    expect(args.update).toEqual({ count: { increment: 1 } });
  });

  it("truncates windowStart to the fixed window boundary and rolls over", async () => {
    vi.useFakeTimers();
    const windowMs = OPTS.windowSec * 1000;
    const base = Math.floor(Date.parse("2026-07-21T12:00:00Z") / windowMs) * windowMs;

    // Two calls inside the same window share a windowStart...
    vi.setSystemTime(base + 1000);
    await checkRateLimit("k", OPTS);
    vi.setSystemTime(base + windowMs - 1000);
    await checkRateLimit("k", OPTS);
    // ...and a call after the boundary starts a fresh window.
    vi.setSystemTime(base + windowMs + 1000);
    await checkRateLimit("k", OPTS);

    const starts = mocks.rateLimitBucket.upsert.mock.calls.map(
      (call) => (call[0].where.key_windowStart.windowStart as Date).getTime()
    );
    expect(starts[0]).toBe(base);
    expect(starts[1]).toBe(base);
    expect(starts[2]).toBe(base + windowMs);

    // expiresAt is always windowStart + window.
    const create = mocks.rateLimitBucket.upsert.mock.calls[2][0].create;
    expect((create.expiresAt as Date).getTime()).toBe(base + 2 * windowMs);
  });

  it("computes retryAfterSec from the end of the current window", async () => {
    vi.useFakeTimers();
    const windowMs = OPTS.windowSec * 1000;
    const base = Math.floor(Date.parse("2026-07-21T12:00:00Z") / windowMs) * windowMs;
    vi.setSystemTime(base + 60_000); // one minute into the window

    mocks.rateLimitBucket.upsert.mockResolvedValue({ count: 99 });
    const result = await checkRateLimit("k", OPTS);
    expect(result.retryAfterSec).toBe(OPTS.windowSec - 60);
  });

  it("fails OPEN when the database errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rateLimitBucket.upsert.mockRejectedValue(new Error("db down"));

    const result = await checkRateLimit("signup:ip:1.2.3.4", OPTS);
    expect(result).toEqual({ allowed: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("opportunistically deletes expired buckets on ~1% of calls", async () => {
    randomSpy.mockReturnValue(0.001);
    await checkRateLimit("k", OPTS);
    expect(mocks.rateLimitBucket.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });

    mocks.rateLimitBucket.deleteMany.mockClear();
    randomSpy.mockReturnValue(0.5);
    await checkRateLimit("k", OPTS);
    expect(mocks.rateLimitBucket.deleteMany).not.toHaveBeenCalled();
  });

  it("swallows cleanup failures without affecting the caller", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    randomSpy.mockReturnValue(0.001);
    mocks.rateLimitBucket.deleteMany.mockRejectedValue(new Error("cleanup failed"));

    const result = await checkRateLimit("k", OPTS);
    expect(result).toEqual({ allowed: true });
    // Let the fire-and-forget rejection settle inside its own catch.
    await new Promise((resolve) => setImmediate(resolve));
    consoleSpy.mockRestore();
  });
});

describe("rateLimitMessage", () => {
  it("rounds seconds up to whole minutes", () => {
    expect(rateLimitMessage(60)).toBe("Too many requests — try again in 1 minute.");
    expect(rateLimitMessage(61)).toBe("Too many requests — try again in 2 minutes.");
    expect(rateLimitMessage(3600)).toBe("Too many requests — try again in 60 minutes.");
  });

  it("defaults to one minute when retryAfterSec is unknown", () => {
    expect(rateLimitMessage()).toBe("Too many requests — try again in 1 minute.");
    expect(rateLimitMessage(1)).toBe("Too many requests — try again in 1 minute.");
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for hop", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "5.6.7.8" })
    );
    expect(await getClientIp()).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then cf-connecting-ip", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "5.6.7.8" }));
    expect(await getClientIp()).toBe("5.6.7.8");

    mocks.headers.mockResolvedValue(new Headers({ "cf-connecting-ip": "9.9.9.9" }));
    expect(await getClientIp()).toBe("9.9.9.9");
  });

  it("returns null when no IP header is present so callers can skip per-IP checks", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    expect(await getClientIp()).toBeNull();
  });

  it("returns null when headers() is unavailable (outside a request scope)", async () => {
    mocks.headers.mockRejectedValue(new Error("headers called outside request scope"));
    expect(await getClientIp()).toBeNull();
  });
});

describe("RATE_LIMITS", () => {
  it("defines positive limits and windows for every policy", () => {
    for (const policy of Object.values(RATE_LIMITS)) {
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowSec).toBeGreaterThan(0);
    }
  });
});
