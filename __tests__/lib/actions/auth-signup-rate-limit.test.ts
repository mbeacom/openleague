import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  invitation: {
    findUnique: vi.fn(),
  },
  hash: vi.fn(),
  issueVerificationToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
  ensureLeagueUser: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: mocks.user, invitation: mocks.invitation },
}));

vi.mock("bcryptjs", () => ({
  hash: mocks.hash,
}));

vi.mock("@/lib/auth/tokens", () => ({
  issueVerificationToken: mocks.issueVerificationToken,
}));

vi.mock("@/lib/email/templates", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

vi.mock("@/lib/actions/league", () => ({
  ensureLeagueUser: mocks.ensureLeagueUser,
}));

vi.mock("@/lib/utils/durable-rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitMessage: (retryAfterSec?: number) => {
    const minutes = Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60));
    return `Too many requests — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  },
  RATE_LIMITS: {
    SIGNUP_PER_IP: { limit: 5, windowSec: 3600 },
    SIGNUP_PER_EMAIL: { limit: 3, windowSec: 3600 },
  },
}));

import { signup } from "@/lib/actions/auth";

const validInput = {
  email: "new@example.com",
  password: "a-strong-password",
  name: "New User",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.findUnique.mockResolvedValue(null);
  mocks.user.create.mockResolvedValue({
    id: "user-1",
    email: "new@example.com",
    name: "New User",
    emailVerified: null,
  });
  mocks.invitation.findUnique.mockResolvedValue(null);
  mocks.hash.mockResolvedValue("hashed-password");
  mocks.issueVerificationToken.mockResolvedValue({ raw: "raw-token" });
  mocks.sendVerificationEmail.mockResolvedValue(undefined);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.getClientIp.mockResolvedValue("1.2.3.4");
});

describe("signup rate limiting", () => {
  it("checks the per-IP and per-email buckets before any expensive work", async () => {
    const result = await signup(validInput);
    expect(result).toHaveProperty("success", true);

    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(
      1,
      "signup:ip:1.2.3.4",
      { limit: 5, windowSec: 3600 }
    );
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(
      2,
      "signup:email:new@example.com",
      { limit: 3, windowSec: 3600 }
    );
  });

  it("rejects when the per-IP limit is exceeded, before user lookup or bcrypt", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 1800 });

    const result = await signup(validInput);
    expect(result).toEqual({ error: "Too many requests — try again in 30 minutes." });

    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.user.create).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rejects when the per-email limit is exceeded even if the IP is under its cap", async () => {
    mocks.checkRateLimit.mockImplementation(async (key: string) =>
      key.startsWith("signup:email:") ? { allowed: false, retryAfterSec: 60 } : { allowed: true }
    );

    const result = await signup(validInput);
    expect(result).toEqual({ error: "Too many requests — try again in 1 minute." });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it("skips the per-IP bucket when no client IP is available", async () => {
    mocks.getClientIp.mockResolvedValue(null);

    const result = await signup(validInput);
    expect(result).toHaveProperty("success", true);

    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "signup:email:new@example.com",
      { limit: 3, windowSec: 3600 }
    );
  });
});
