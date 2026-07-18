import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  requireUserId: vi.fn(),
  issueVerificationToken: vi.fn(),
  sendEmailChangeVerificationEmail: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: mocks.user },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/lib/auth/tokens", () => ({
  issueVerificationToken: mocks.issueVerificationToken,
}));

vi.mock("@/lib/email/templates", () => ({
  sendEmailChangeVerificationEmail: mocks.sendEmailChangeVerificationEmail,
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.compare,
  hash: mocks.hash,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  changePassword,
  deleteAccount,
  requestEmailChange,
  updateProfile,
} from "@/lib/actions/account";

const baseUser = {
  id: "user-1",
  email: "me@example.com",
  name: "Me",
  passwordHash: "stored-hash",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.user.findUnique.mockResolvedValue(baseUser);
  mocks.user.update.mockResolvedValue({ name: "Me" });
  mocks.user.delete.mockResolvedValue({});
  mocks.compare.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("new-hash");
  mocks.issueVerificationToken.mockResolvedValue({ raw: "raw-token" });
  mocks.sendEmailChangeVerificationEmail.mockResolvedValue(undefined);
});

describe("updateProfile", () => {
  it("updates the display name for the authenticated user", async () => {
    const result = await updateProfile({ name: "New Name" });
    expect(result.success).toBe(true);
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "New Name" },
      select: { name: true },
    });
  });

  it("clears the name when empty", async () => {
    await updateProfile({ name: undefined });
    expect(mocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: null } })
    );
  });
});

describe("changePassword", () => {
  it("rejects a wrong current password without updating", async () => {
    mocks.compare.mockResolvedValue(false);
    const result = await changePassword({
      currentPassword: "wrong",
      newPassword: "new-password-1",
    });
    expect(result).toEqual({ success: false, error: "Current password is incorrect" });
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("hashes and stores the new password", async () => {
    const result = await changePassword({
      currentPassword: "correct",
      newPassword: "new-password-1",
    });
    expect(result.success).toBe(true);
    expect(mocks.compare).toHaveBeenCalledWith("correct", "stored-hash");
    expect(mocks.hash).toHaveBeenCalledWith("new-password-1", 12);
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-hash" },
    });
  });

  it("enforces the new-password policy", async () => {
    const result = await changePassword({ currentPassword: "correct", newPassword: "short" });
    expect(result.success).toBe(false);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });
});

describe("requestEmailChange", () => {
  it("requires the correct password", async () => {
    mocks.compare.mockResolvedValue(false);
    const result = await requestEmailChange({
      newEmail: "new@example.com",
      password: "wrong",
    });
    expect(result).toEqual({ success: false, error: "Password is incorrect" });
    expect(mocks.issueVerificationToken).not.toHaveBeenCalled();
  });

  it("rejects an address already in use", async () => {
    mocks.user.findUnique
      .mockResolvedValueOnce(baseUser) // current user lookup
      .mockResolvedValueOnce({ id: "someone-else" }); // taken check
    const result = await requestEmailChange({
      newEmail: "taken@example.com",
      password: "correct",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already exists");
    }
    expect(mocks.issueVerificationToken).not.toHaveBeenCalled();
  });

  it("sends the confirmation link to the NEW address only", async () => {
    mocks.user.findUnique
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce(null);
    const result = await requestEmailChange({
      newEmail: "new@example.com",
      password: "correct",
    });
    expect(result.success).toBe(true);
    expect(mocks.issueVerificationToken).toHaveBeenCalledWith("user-1", "EMAIL_CHANGE", {
      newEmail: "new@example.com",
    });
    expect(mocks.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      newEmail: "new@example.com",
      name: "Me",
      token: "raw-token",
    });
  });

  it("surfaces throttling as a friendly error", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(baseUser).mockResolvedValueOnce(null);
    mocks.issueVerificationToken.mockResolvedValue({ throttled: true });
    const result = await requestEmailChange({
      newEmail: "new@example.com",
      password: "correct",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Too many");
    }
  });
});

describe("deleteAccount", () => {
  it("requires the correct password", async () => {
    mocks.compare.mockResolvedValue(false);
    const result = await deleteAccount({ password: "wrong" });
    expect(result).toEqual({ success: false, error: "Password is incorrect" });
    expect(mocks.user.delete).not.toHaveBeenCalled();
  });

  it("deletes only the caller's account", async () => {
    const result = await deleteAccount({ password: "correct" });
    expect(result.success).toBe(true);
    expect(mocks.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });
});
