import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: mocks.user },
}));

import { seedSessionToken, revalidateSessionToken } from "@/lib/auth/session-version";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.findUnique.mockResolvedValue({ sessionVersion: 0 });
});

describe("seedSessionToken", () => {
  it("snapshots the user id + session version onto the token", () => {
    const token = seedSessionToken({} as Record<string, unknown>, "user-1", 3);
    expect(token.id).toBe("user-1");
    expect(token.sv).toBe(3);
    expect(typeof token.svCheckedAt).toBe("number");
  });
});

describe("revalidateSessionToken", () => {
  it("passes a stale token when the DB version still matches", async () => {
    mocks.user.findUnique.mockResolvedValue({ sessionVersion: 5 });
    const result = await revalidateSessionToken({
      id: "user-1",
      sv: 5,
      svCheckedAt: Date.now() - 120_000,
    });
    expect(result).not.toBeNull();
    expect(mocks.user.findUnique).toHaveBeenCalledOnce();
    expect(result?.svCheckedAt).toBeGreaterThan(Date.now() - 5_000);
  });

  it("invalidates (null) when the DB version has advanced past the token", async () => {
    mocks.user.findUnique.mockResolvedValue({ sessionVersion: 6 });
    const result = await revalidateSessionToken({
      id: "user-1",
      sv: 5,
      svCheckedAt: Date.now() - 120_000,
    });
    expect(result).toBeNull();
  });

  it("invalidates when the user no longer exists", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    const result = await revalidateSessionToken({
      id: "user-1",
      sv: 5,
      svCheckedAt: Date.now() - 120_000,
    });
    expect(result).toBeNull();
  });

  it("skips the DB hit for a freshly-checked token (throttle)", async () => {
    const result = await revalidateSessionToken({
      id: "user-1",
      sv: 0,
      svCheckedAt: Date.now() - 1_000,
    });
    expect(result).not.toBeNull();
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("forces a re-check on an explicit session update even if recently checked", async () => {
    mocks.user.findUnique.mockResolvedValue({ sessionVersion: 9 });
    const result = await revalidateSessionToken(
      { id: "user-1", sv: 0, svCheckedAt: Date.now() - 1_000 },
      { force: true }
    );
    expect(result).toBeNull();
    expect(mocks.user.findUnique).toHaveBeenCalledOnce();
  });

  it("treats a token with no id as anonymous and returns it untouched", async () => {
    const result = await revalidateSessionToken({});
    expect(result).not.toBeNull();
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });
});
