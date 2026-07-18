import { describe, it, expect } from "vitest";
import { addPlayerSchema, updatePlayerSchema } from "@/lib/utils/validation";

const TEAM_ID = "cjld2cjxh0000qzrmn831i7rn";

const base = {
  name: "Skater Kid",
  email: "",
  phone: "",
  emergencyContact: "",
  emergencyPhone: "",
  teamId: TEAM_ID,
  jerseyNumber: null,
  position: "",
  usahMemberId: null,
};

describe("addPlayerSchema dateOfBirth", () => {
  it("accepts an absent / null date of birth", () => {
    expect(addPlayerSchema.safeParse(base).success).toBe(true);
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: null }).success).toBe(true);
  });

  it("accepts a valid YYYY-MM-DD date", () => {
    const result = addPlayerSchema.safeParse({ ...base, dateOfBirth: "2015-03-09" });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO formats", () => {
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: "03/09/2015" }).success).toBe(false);
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: "2015-3-9" }).success).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: "2015-02-30" }).success).toBe(false);
  });

  it("rejects dates before 1900", () => {
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: "1899-12-31" }).success).toBe(false);
  });

  it("rejects future dates", () => {
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(addPlayerSchema.safeParse({ ...base, dateOfBirth: future }).success).toBe(false);
  });

  it("accepts the parentalConsent boolean", () => {
    const result = addPlayerSchema.safeParse({
      ...base,
      dateOfBirth: "2020-01-01",
      parentalConsent: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("updatePlayerSchema dateOfBirth", () => {
  it("still requires the player id and carries the new fields", () => {
    const result = updatePlayerSchema.safeParse({
      ...base,
      id: "player-1",
      dateOfBirth: "2015-03-09",
      parentalConsent: true,
    });
    expect(result.success).toBe(true);
    expect(updatePlayerSchema.safeParse({ ...base, dateOfBirth: "2015-03-09" }).success).toBe(false);
  });
});
