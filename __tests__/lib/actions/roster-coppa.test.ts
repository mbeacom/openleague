import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrismaPlayer,
  mockPrismaParentalConsent,
  mockTransaction,
  mockTxPlayer,
  mockTxParentalConsent,
  mockRequireTeamAdmin,
  mockRequireUserId,
} = vi.hoisted(() => ({
  mockPrismaPlayer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  mockPrismaParentalConsent: {
    findFirst: vi.fn(),
  },
  mockTransaction: vi.fn(),
  mockTxPlayer: {
    create: vi.fn(),
    update: vi.fn(),
  },
  mockTxParentalConsent: {
    create: vi.fn(),
  },
  mockRequireTeamAdmin: vi.fn(),
  mockRequireUserId: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    player: mockPrismaPlayer,
    parentalConsent: mockPrismaParentalConsent,
    $transaction: mockTransaction,
  },
}));

import { addPlayer, updatePlayer } from "@/lib/actions/roster";
import { COPPA_CONSENT_VERSION, CONSENT_METHOD_ACCOUNT_ATTESTATION } from "@/lib/utils/coppa";

const USER_ID = "user-admin-1";
const TEAM_ID = "cjld2cjxh0000qzrmn831i7rn";
const PLAYER_ID = "cjld2cjxh0001qzrmn831i7rn";

// DOBs relative to "now": the action uses the real clock, so derive dates
// that are unambiguously under/over 13 regardless of when tests run.
const under13Dob = () => {
  const d = new Date();
  return `${d.getUTCFullYear() - 8}-01-01`;
};
const over13Dob = () => {
  const d = new Date();
  return `${d.getUTCFullYear() - 20}-01-01`;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireTeamAdmin.mockResolvedValue(USER_ID);
  mockRequireUserId.mockResolvedValue(USER_ID);
  // $transaction(fn) runs the callback with a tx client containing our tx mocks
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ player: mockTxPlayer, parentalConsent: mockTxParentalConsent })
  );
  mockTxPlayer.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: PLAYER_ID,
    ...data,
  }));
  mockTxPlayer.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: PLAYER_ID,
    ...data,
  }));
  mockTxParentalConsent.create.mockResolvedValue({ id: "consent-1" });
});

const baseInput = {
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

describe("addPlayer COPPA enforcement", () => {
  it("rejects an under-13 DOB without parental consent", async () => {
    const result = await addPlayer({ ...baseInput, dateOfBirth: under13Dob() });

    expect(result.error).toMatch(/parental consent/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates the player and a consent row when attestation is given", async () => {
    const result = await addPlayer({
      ...baseInput,
      dateOfBirth: under13Dob(),
      parentalConsent: true,
    });

    expect(result.error).toBeUndefined();
    expect(mockTxPlayer.create).toHaveBeenCalledTimes(1);
    expect(mockTxParentalConsent.create).toHaveBeenCalledWith({
      data: {
        playerId: PLAYER_ID,
        grantedByUserId: USER_ID,
        method: CONSENT_METHOD_ACCOUNT_ATTESTATION,
        consentVersion: COPPA_CONSENT_VERSION,
        childName: baseInput.name,
        childDateOfBirth: new Date(`${under13Dob()}T00:00:00.000Z`),
        teamId: TEAM_ID,
      },
    });
  });

  it("captures the child snapshot (name/DOB/team) so the audit row survives player deletion", async () => {
    const dob = under13Dob();
    await addPlayer({ ...baseInput, dateOfBirth: dob, parentalConsent: true });

    const data = mockTxParentalConsent.create.mock.calls[0][0].data as {
      childName: string;
      childDateOfBirth: Date;
      teamId: string;
      playerId: string;
    };
    expect(data.childName).toBe(baseInput.name);
    expect(data.childDateOfBirth).toBeInstanceOf(Date);
    expect(data.childDateOfBirth.toISOString()).toBe(`${dob}T00:00:00.000Z`);
    expect(data.teamId).toBe(TEAM_ID);
    expect(data.playerId).toBe(PLAYER_ID);
  });

  it("does not require consent for a 13+ DOB", async () => {
    const result = await addPlayer({ ...baseInput, dateOfBirth: over13Dob() });

    expect(result.error).toBeUndefined();
    expect(mockTxParentalConsent.create).not.toHaveBeenCalled();
  });

  it("does not require consent when no DOB is provided", async () => {
    const result = await addPlayer({ ...baseInput });

    expect(result.error).toBeUndefined();
    expect(mockTxParentalConsent.create).not.toHaveBeenCalled();
  });

  it("stores the DOB as a UTC-midnight Date", async () => {
    await addPlayer({ ...baseInput, dateOfBirth: over13Dob() });

    const data = mockTxPlayer.create.mock.calls[0][0].data as { dateOfBirth: Date };
    expect(data.dateOfBirth).toBeInstanceOf(Date);
    expect(data.dateOfBirth.toISOString()).toBe(`${over13Dob()}T00:00:00.000Z`);
  });
});

describe("updatePlayer COPPA enforcement", () => {
  beforeEach(() => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ teamId: TEAM_ID });
  });

  it("rejects setting an under-13 DOB without existing consent or attestation", async () => {
    mockPrismaParentalConsent.findFirst.mockResolvedValue(null);

    const result = await updatePlayer({
      ...baseInput,
      id: PLAYER_ID,
      dateOfBirth: under13Dob(),
    });

    expect(result.error).toMatch(/parental consent/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("accepts an under-13 DOB when active consent already exists (no new row)", async () => {
    mockPrismaParentalConsent.findFirst.mockResolvedValue({ id: "consent-existing" });

    const result = await updatePlayer({
      ...baseInput,
      id: PLAYER_ID,
      dateOfBirth: under13Dob(),
    });

    expect(result.error).toBeUndefined();
    expect(mockTxParentalConsent.create).not.toHaveBeenCalled();
  });

  it("records a consent row when a fresh attestation is given", async () => {
    mockPrismaParentalConsent.findFirst.mockResolvedValue(null);

    const result = await updatePlayer({
      ...baseInput,
      id: PLAYER_ID,
      dateOfBirth: under13Dob(),
      parentalConsent: true,
    });

    expect(result.error).toBeUndefined();
    expect(mockTxParentalConsent.create).toHaveBeenCalledWith({
      data: {
        playerId: PLAYER_ID,
        grantedByUserId: USER_ID,
        method: CONSENT_METHOD_ACCOUNT_ATTESTATION,
        consentVersion: COPPA_CONSENT_VERSION,
        childName: baseInput.name,
        childDateOfBirth: new Date(`${under13Dob()}T00:00:00.000Z`),
        teamId: TEAM_ID,
      },
    });
  });

  it("leaves consent rows untouched when DOB moves to 13+", async () => {
    const result = await updatePlayer({
      ...baseInput,
      id: PLAYER_ID,
      dateOfBirth: over13Dob(),
    });

    expect(result.error).toBeUndefined();
    expect(mockPrismaParentalConsent.findFirst).not.toHaveBeenCalled();
    expect(mockTxParentalConsent.create).not.toHaveBeenCalled();
  });

  it("does not touch DOB when the field is absent", async () => {
    const result = await updatePlayer({ ...baseInput, id: PLAYER_ID });

    expect(result.error).toBeUndefined();
    const data = mockTxPlayer.update.mock.calls[0][0].data as Record<string, unknown>;
    expect("dateOfBirth" in data).toBe(false);
  });
});
