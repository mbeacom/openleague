import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockPrisma, mockRedirect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { getCurrentUserId, requireUserId } from "@/lib/auth/session";

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session user id without querying the database", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
    });

    await expect(getCurrentUserId()).resolves.toBe("user-1");

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves stale JWT sessions that have email but no user id", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "admin@example.com" },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-from-email" });

    await expect(requireUserId()).resolves.toBe("user-from-email");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
  });

  it("redirects when an authenticated session cannot be resolved to a user id", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "missing@example.com" },
    });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(requireUserId()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
