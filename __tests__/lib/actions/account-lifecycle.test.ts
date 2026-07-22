import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  verificationToken: {
    deleteMany: vi.fn(),
  },
  issueVerificationToken: vi.fn(),
  consumeVerificationToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendEmailChangedNoticeEmail: vi.fn(),
  hash: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: mocks.user, verificationToken: mocks.verificationToken },
}));

vi.mock("@/lib/auth/tokens", () => ({
  issueVerificationToken: mocks.issueVerificationToken,
  consumeVerificationToken: mocks.consumeVerificationToken,
}));

vi.mock("@/lib/email/templates", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendVerificationEmail: mocks.sendVerificationEmail,
  sendEmailChangedNoticeEmail: mocks.sendEmailChangedNoticeEmail,
}));

vi.mock("bcryptjs", () => ({
  hash: mocks.hash,
}));

vi.mock("@/lib/utils/durable-rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitMessage: (retryAfterSec?: number) => {
    const minutes = Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60));
    return `Too many requests — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  },
  RATE_LIMITS: {
    PASSWORD_RESET_PER_IP: { limit: 10, windowSec: 900 },
    VERIFICATION_RESEND_PER_IP: { limit: 10, windowSec: 900 },
  },
}));

import {
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
  confirmEmailVerification,
  confirmEmailChange,
} from "@/lib/actions/account-lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.findUnique.mockResolvedValue(null);
  mocks.user.update.mockResolvedValue({});
  mocks.user.updateMany.mockResolvedValue({ count: 0 });
  mocks.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.issueVerificationToken.mockResolvedValue({ raw: "raw-token" });
  mocks.consumeVerificationToken.mockResolvedValue(null);
  mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  mocks.sendVerificationEmail.mockResolvedValue(undefined);
  mocks.sendEmailChangedNoticeEmail.mockResolvedValue(undefined);
  mocks.hash.mockResolvedValue("hashed-password");
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.getClientIp.mockResolvedValue("1.2.3.4");
});

describe("requestPasswordReset", () => {
  it("returns the same success response whether or not the account exists", async () => {
    const unknown = await requestPasswordReset({ email: "nobody@example.com" });

    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "someone@example.com",
      name: "Someone",
    });
    const known = await requestPasswordReset({ email: "someone@example.com" });

    expect(unknown).toEqual(known);
    expect(unknown.success).toBe(true);
  });

  it("sends a reset email only for existing accounts", async () => {
    await requestPasswordReset({ email: "nobody@example.com" });
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();

    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "someone@example.com",
      name: "Someone",
    });
    await requestPasswordReset({ email: "someone@example.com" });
    expect(mocks.issueVerificationToken).toHaveBeenCalledWith("user-1", "PASSWORD_RESET");
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "someone@example.com",
      name: "Someone",
      token: "raw-token",
    });
  });

  it("swallows throttling into the generic success response", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "someone@example.com",
      name: null,
    });
    mocks.issueVerificationToken.mockResolvedValue({ throttled: true });

    const result = await requestPasswordReset({ email: "someone@example.com" });
    expect(result.success).toBe(true);
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid email shape", async () => {
    const result = await requestPasswordReset({ email: "not-an-email" });
    expect(result).toEqual({ success: false, error: "Please enter a valid email address" });
  });

  it("rejects when the per-IP rate limit is exceeded, before any user lookup", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 900 });

    const result = await requestPasswordReset({ email: "someone@example.com" });
    expect(result).toEqual({
      success: false,
      error: "Too many requests — try again in 15 minutes.",
    });

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("pw-reset:ip:1.2.3.4", {
      limit: 10,
      windowSec: 900,
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("skips the per-IP check when no client IP is available", async () => {
    mocks.getClientIp.mockResolvedValue(null);

    const result = await requestPasswordReset({ email: "someone@example.com" });
    expect(result.success).toBe(true);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("fails cleanly on an invalid or expired token", async () => {
    const result = await resetPassword({ token: "bad-token", password: "new-password-1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("invalid or has expired");
    }
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("updates the password hash and marks the email verified", async () => {
    mocks.consumeVerificationToken.mockResolvedValue({ userId: "user-1", newEmail: null });

    const result = await resetPassword({ token: "good-token", password: "new-password-1" });
    expect(result.success).toBe(true);

    expect(mocks.consumeVerificationToken).toHaveBeenCalledWith("good-token", "PASSWORD_RESET");
    expect(mocks.hash).toHaveBeenCalledWith("new-password-1", 12);
    // Also bumps sessionVersion to evict outstanding sessions on recovery.
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed-password", sessionVersion: { increment: 1 } },
    });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", emailVerified: null },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it("enforces the password policy", async () => {
    const result = await resetPassword({ token: "good-token", password: "short" });
    expect(result.success).toBe(false);
    expect(mocks.consumeVerificationToken).not.toHaveBeenCalled();
  });
});

describe("resendVerificationEmail", () => {
  it("is enumeration-safe for unknown addresses", async () => {
    const result = await resendVerificationEmail({ email: "nobody@example.com" });
    expect(result.success).toBe(true);
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("skips already-verified accounts", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "someone@example.com",
      name: null,
      emailVerified: new Date(),
    });
    const result = await resendVerificationEmail({ email: "someone@example.com" });
    expect(result.success).toBe(true);
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("sends a fresh link for unverified accounts", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "someone@example.com",
      name: "Someone",
      emailVerified: null,
    });
    await resendVerificationEmail({ email: "someone@example.com" });
    expect(mocks.issueVerificationToken).toHaveBeenCalledWith("user-1", "EMAIL_VERIFICATION");
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      email: "someone@example.com",
      name: "Someone",
      token: "raw-token",
    });
  });

  it("rejects when the per-IP rate limit is exceeded, before any user lookup", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 120 });

    const result = await resendVerificationEmail({ email: "someone@example.com" });
    expect(result).toEqual({
      success: false,
      error: "Too many requests — try again in 2 minutes.",
    });

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("verify-resend:ip:1.2.3.4", {
      limit: 10,
      windowSec: 900,
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe("confirmEmailVerification", () => {
  it("rejects an invalid or expired token without mutating", async () => {
    mocks.consumeVerificationToken.mockResolvedValue(null);
    const result = await confirmEmailVerification("bad-token");
    expect(result.success).toBe(false);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it("marks the account verified on a valid token", async () => {
    mocks.consumeVerificationToken.mockResolvedValue({ userId: "user-1", newEmail: null });
    const result = await confirmEmailVerification("good-token");
    expect(result.success).toBe(true);
    expect(mocks.consumeVerificationToken).toHaveBeenCalledWith("good-token", "EMAIL_VERIFICATION");
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", emailVerified: null },
      data: { emailVerified: expect.any(Date) },
    });
  });
});

describe("confirmEmailChange", () => {
  it("rejects an invalid token", async () => {
    mocks.consumeVerificationToken.mockResolvedValue(null);
    const result = await confirmEmailChange("bad-token");
    expect(result.success).toBe(false);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("rejects when the new address was claimed by someone else since the request", async () => {
    mocks.consumeVerificationToken.mockResolvedValue({
      userId: "user-1",
      newEmail: "new@example.com",
    });
    mocks.user.findUnique.mockResolvedValueOnce({ id: "someone-else" }); // taken check
    const result = await confirmEmailChange("good-token");
    expect(result.success).toBe(false);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("applies the change, evicts sessions, revokes tokens, and notifies the old address", async () => {
    mocks.consumeVerificationToken.mockResolvedValue({
      userId: "user-1",
      newEmail: "new@example.com",
    });
    mocks.user.findUnique
      .mockResolvedValueOnce(null) // taken check: available
      .mockResolvedValueOnce({ email: "old@example.com", name: "Someone" }); // current user

    const result = await confirmEmailChange("good-token");
    expect(result.success).toBe(true);

    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: "new@example.com",
        emailVerified: expect.any(Date),
        sessionVersion: { increment: 1 },
      },
    });
    expect(mocks.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
    });
    expect(mocks.sendEmailChangedNoticeEmail).toHaveBeenCalledWith({
      oldEmail: "old@example.com",
      newEmail: "new@example.com",
      name: "Someone",
    });
  });
});
