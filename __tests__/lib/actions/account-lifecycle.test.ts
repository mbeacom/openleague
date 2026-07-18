import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  issueVerificationToken: vi.fn(),
  consumeVerificationToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: mocks.user },
}));

vi.mock("@/lib/auth/tokens", () => ({
  issueVerificationToken: mocks.issueVerificationToken,
  consumeVerificationToken: mocks.consumeVerificationToken,
}));

vi.mock("@/lib/email/templates", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

vi.mock("bcryptjs", () => ({
  hash: mocks.hash,
}));

import {
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
} from "@/lib/actions/account-lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.findUnique.mockResolvedValue(null);
  mocks.user.update.mockResolvedValue({});
  mocks.user.updateMany.mockResolvedValue({ count: 0 });
  mocks.issueVerificationToken.mockResolvedValue({ raw: "raw-token" });
  mocks.consumeVerificationToken.mockResolvedValue(null);
  mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  mocks.sendVerificationEmail.mockResolvedValue(undefined);
  mocks.hash.mockResolvedValue("hashed-password");
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
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed-password" },
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
});
