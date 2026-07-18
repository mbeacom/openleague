import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verificationToken: {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { verificationToken: mocks.verificationToken },
}));

import {
  hashToken,
  issueVerificationToken,
  consumeVerificationToken,
  TOKEN_TTLS_MS,
} from "@/lib/auth/tokens";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verificationToken.count.mockResolvedValue(0);
  mocks.verificationToken.create.mockResolvedValue({});
  mocks.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.verificationToken.updateMany.mockResolvedValue({ count: 0 });
  mocks.verificationToken.findUnique.mockResolvedValue(null);
});

describe("hashToken", () => {
  it("is deterministic and never equals the raw value", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe("abc");
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("issueVerificationToken", () => {
  it("stores only the hash of the returned raw token", async () => {
    const result = await issueVerificationToken("user-1", "EMAIL_VERIFICATION");
    expect(result).toHaveProperty("raw");
    const raw = (result as { raw: string }).raw;

    const createArgs = mocks.verificationToken.create.mock.calls[0][0];
    expect(createArgs.data.tokenHash).toBe(hashToken(raw));
    expect(createArgs.data.tokenHash).not.toBe(raw);
    expect(createArgs.data.type).toBe("EMAIL_VERIFICATION");
    expect(createArgs.data.userId).toBe("user-1");
  });

  it("applies the per-type TTL", async () => {
    const before = Date.now();
    await issueVerificationToken("user-1", "PASSWORD_RESET");
    const createArgs = mocks.verificationToken.create.mock.calls[0][0];
    const expiresAt = createArgs.data.expiresAt as Date;
    const delta = expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(TOKEN_TTLS_MS.PASSWORD_RESET - 5000);
    expect(delta).toBeLessThanOrEqual(TOKEN_TTLS_MS.PASSWORD_RESET + 5000);
  });

  it("throttles after 3 issues in an hour", async () => {
    mocks.verificationToken.count.mockResolvedValue(3);
    const result = await issueVerificationToken("user-1", "EMAIL_VERIFICATION");
    expect(result).toEqual({ throttled: true });
    expect(mocks.verificationToken.create).not.toHaveBeenCalled();
  });

  it("passes newEmail through for EMAIL_CHANGE tokens", async () => {
    await issueVerificationToken("user-1", "EMAIL_CHANGE", { newEmail: "new@example.com" });
    const createArgs = mocks.verificationToken.create.mock.calls[0][0];
    expect(createArgs.data.newEmail).toBe("new@example.com");
  });
});

describe("consumeVerificationToken", () => {
  it("returns null when no valid token matches", async () => {
    mocks.verificationToken.updateMany.mockResolvedValue({ count: 0 });
    const result = await consumeVerificationToken("raw-token", "EMAIL_VERIFICATION");
    expect(result).toBeNull();
    expect(mocks.verificationToken.findUnique).not.toHaveBeenCalled();
  });

  it("guards consumption on type, usedAt, and expiry in one update", async () => {
    mocks.verificationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.verificationToken.findUnique.mockResolvedValue({
      userId: "user-1",
      newEmail: null,
    });

    const result = await consumeVerificationToken("raw-token", "PASSWORD_RESET");
    expect(result).toEqual({ userId: "user-1", newEmail: null });

    const updateArgs = mocks.verificationToken.updateMany.mock.calls[0][0];
    expect(updateArgs.where.tokenHash).toBe(hashToken("raw-token"));
    expect(updateArgs.where.type).toBe("PASSWORD_RESET");
    expect(updateArgs.where.usedAt).toBeNull();
    expect(updateArgs.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(updateArgs.data.usedAt).toBeInstanceOf(Date);
  });

  it("retires unused sibling tokens of the same type after consumption", async () => {
    mocks.verificationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.verificationToken.findUnique.mockResolvedValue({
      userId: "user-1",
      newEmail: null,
    });

    await consumeVerificationToken("raw-token", "EMAIL_VERIFICATION");

    expect(mocks.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "EMAIL_VERIFICATION", usedAt: null },
    });
  });
});
