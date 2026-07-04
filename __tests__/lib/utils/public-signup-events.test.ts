import { describe, expect, it } from "vitest";
import { publicSignupEventSelect, toPublicRosterName } from "@/lib/utils/public-signup-events";

describe("toPublicRosterName", () => {
  it("returns first name plus last initial", () => {
    expect(toPublicRosterName("Jordan Smith")).toBe("Jordan S.");
    expect(toPublicRosterName("Mary Jo Van Dyke")).toBe("Mary D.");
  });

  it("handles single names and whitespace", () => {
    expect(toPublicRosterName("Cher")).toBe("Cher");
    expect(toPublicRosterName("  Alex   Ovechkin  ")).toBe("Alex O.");
    expect(toPublicRosterName("")).toBe("");
  });
});

describe("publicSignupEventSelect (public data boundary)", () => {
  it("never selects registrations, invitations, managers, media, or audit fields", () => {
    const forbiddenKeys = [
      "registrations",
      "invitations",
      "managers",
      "media",
      "teams",
      "games",
      "linkToken",
      "createdBy",
      "createdById",
      "updatedBy",
      "updatedById",
    ];
    for (const key of forbiddenKeys) {
      expect(publicSignupEventSelect).not.toHaveProperty(key);
    }
  });

  it("never selects participant identity fields on slots", () => {
    const slotSelect = publicSignupEventSelect.slots.select;
    expect(slotSelect).not.toHaveProperty("registrations");
    const selectedKeys = Object.keys(slotSelect);
    for (const key of selectedKeys) {
      expect(key.toLowerCase()).not.toContain("participant");
      expect(key.toLowerCase()).not.toContain("registrant");
    }
  });
});
