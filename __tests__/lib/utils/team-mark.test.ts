/** The team mark vocabulary: profile validation, lenient reads, alt text and export size (practice logo spec R2, R4, R5). */
import { describe, expect, it } from "vitest";
import {
    EXPORT_MARK_HEIGHT,
    EXPORT_MARK_MAX_WIDTH,
    TEAM_COLOR_MESSAGE,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_NAME_LENGTH_MESSAGE,
    TEAM_NAME_REQUIRED_MESSAGE,
    cleanTeamName,
    exportMarkSize,
    isLogoImage,
    readTeamProfile,
    teamLogoAlt,
    teamProfileError,
    teamProfileErrors,
    toTeamMark,
    toTeamProfile,
    type TeamProfileInput,
} from "@/lib/utils/team-mark";
import { logoPng } from "@/__tests__/helpers/logo-png";
import { pngDataUriByteLength } from "@/lib/utils/png-data-uri";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
/** 204,801 decoded bytes: one over the cap. */
const BIG_PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(273_057)}`;

const input = (overrides: Partial<TeamProfileInput> = {}): TeamProfileInput => ({
    name: "Ice Hawks",
    logo: null,
    primaryColor: null,
    secondaryColor: null,
    ...overrides,
});

describe("isLogoImage", () => {
    it("accepts a PNG data URL with sides 1 to 512 and at most 200 KB", () => {
        expect(isLogoImage(LOGO)).toBe(true);
        expect(isLogoImage({ ...LOGO, dataUrl: logoPng(512, 512), width: 512, height: 512 })).toBe(true);
    });

    it("refuses a truncated PNG that only carries the signature", () => {
        expect(isLogoImage({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 1, height: 1 })).toBe(false);
        expect(isLogoImage({ ...LOGO, dataUrl: PNG.slice(0, 60) })).toBe(false);
    });

    it("refuses a PNG whose IHDR size differs from the stored size", () => {
        expect(isLogoImage({ ...LOGO, width: 2 })).toBe(false);
        expect(isLogoImage({ ...LOGO, height: 2 })).toBe(false);
        expect(isLogoImage({ dataUrl: logoPng(300, 100), width: 100, height: 300 })).toBe(false);
        expect(isLogoImage({ dataUrl: logoPng(300, 100), width: 300, height: 100 })).toBe(true);
    });

    it("refuses another type, a bad side, an oversize PNG and a non-object", () => {
        expect(pngDataUriByteLength(BIG_PNG)).toBe(204_801);
        expect(isLogoImage({ ...LOGO, dataUrl: "data:image/jpeg;base64,AAAA" })).toBe(false);
        expect(isLogoImage({ ...LOGO, dataUrl: "https://example.com/logo.png" })).toBe(false);
        expect(isLogoImage({ ...LOGO, width: 513 })).toBe(false);
        expect(isLogoImage({ ...LOGO, height: 0 })).toBe(false);
        expect(isLogoImage({ ...LOGO, width: 1.5 })).toBe(false);
        expect(isLogoImage({ dataUrl: BIG_PNG, width: 1, height: 1 })).toBe(false);
        expect(isLogoImage(null)).toBe(false);
        expect(isLogoImage(PNG)).toBe(false);
        // Well-formed base64, but not a PNG's bytes.
        expect(isLogoImage({ ...LOGO, dataUrl: "data:image/png;base64,AAAA" })).toBe(false);
    });
});

describe("teamProfileErrors", () => {
    it("cleans the name like a staff name and accepts 1 to 60 characters", () => {
        expect(cleanTeamName("  Ice\u0007   Hawks\u200B ")).toBe("Ice Hawks");
        expect(teamProfileError(input({ name: "x".repeat(60) }))).toBeNull();
        expect(teamProfileError(input({ logo: LOGO, primaryColor: "#0d47a1", secondaryColor: "#FFFFFF" }))).toBeNull();
    });

    it("names each field's problem", () => {
        expect(teamProfileErrors(input({ name: " \u0007 " }))).toEqual({ name: TEAM_NAME_REQUIRED_MESSAGE });
        expect(teamProfileErrors(input({ name: "x".repeat(61) }))).toEqual({ name: TEAM_NAME_LENGTH_MESSAGE });
        expect(teamProfileErrors(input({ primaryColor: "#123", secondaryColor: "red" }))).toEqual({
            primaryColor: TEAM_COLOR_MESSAGE,
            secondaryColor: TEAM_COLOR_MESSAGE,
        });
        expect(teamProfileErrors(input({ logo: { ...LOGO, width: 600 } }))).toEqual({ logo: TEAM_LOGO_INVALID_MESSAGE });
        expect(teamProfileError(input({ name: "", primaryColor: "red" }))).toBe(TEAM_NAME_REQUIRED_MESSAGE);
    });
});

describe("toTeamProfile and readTeamProfile", () => {
    it("stores the cleaned name and uppercase colors", () => {
        expect(toTeamProfile(input({ name: " Ice  Hawks ", logo: LOGO, primaryColor: "#9b1b30" }))).toEqual({
            name: "Ice Hawks",
            logo: LOGO,
            primaryColor: "#9B1B30",
            secondaryColor: null,
        });
    });

    it("reads a stored record leniently: a bad name is no profile, a bad logo or color reads as null", () => {
        expect(readTeamProfile(undefined)).toBeNull();
        expect(readTeamProfile(null)).toBeNull();
        expect(readTeamProfile({ name: "" })).toBeNull();
        expect(readTeamProfile({ name: "Ice Hawks", logo: { dataUrl: "javascript:alert(1)", width: 1, height: 1 }, primaryColor: "red", secondaryColor: "#00695C" })).toEqual({
            name: "Ice Hawks",
            logo: null,
            primaryColor: null,
            secondaryColor: "#00695C",
        });
    });
});

describe("toTeamMark, teamLogoAlt and exportMarkSize", () => {
    it("turns a profile into the mark the shared components draw", () => {
        expect(toTeamMark({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null }, "local")).toEqual({
            id: "local",
            name: "Ice Hawks",
            logoUrl: PNG,
            color: "#9B1B30",
            logoImage: LOGO,
        });
        expect(toTeamMark({ name: "Ice Hawks", logo: null, primaryColor: null, secondaryColor: null }, "local").logoUrl).toBeNull();
    });

    it("labels the image with the team name", () => {
        expect(teamLogoAlt(`Hawks <U12> & "Co"`)).toBe(`Hawks <U12> & "Co" logo`);
    });

    it("cleans control and invisible characters out of the alt text", () => {
        expect(teamLogoAlt(" Hawks\u0001\u200B  U12 ")).toBe("Hawks U12 logo");
    });

    it.each([
        ["a zero height", { width: 10, height: 0 }],
        ["a negative width", { width: -1, height: 10 }],
        ["a NaN side", { width: Number.NaN, height: 10 }],
        ["an infinite side", { width: 10, height: Number.POSITIVE_INFINITY }],
    ])("refuses %s", (_label, image) => {
        expect(() => exportMarkSize(image)).toThrow(RangeError);
    });

    it("draws an export mark 48 px high, at most 144 px wide, keeping the ratio", () => {
        expect([EXPORT_MARK_HEIGHT, EXPORT_MARK_MAX_WIDTH]).toEqual([48, 144]);
        expect(exportMarkSize({ width: 512, height: 512 })).toEqual({ width: 48, height: 48 });
        expect(exportMarkSize({ width: 512, height: 256 })).toEqual({ width: 96, height: 48 });
        expect(exportMarkSize({ width: 512, height: 85 })).toEqual({ width: 144, height: 24 });
        expect(exportMarkSize({ width: 64, height: 512 })).toEqual({ width: 6, height: 48 });
    });
});
