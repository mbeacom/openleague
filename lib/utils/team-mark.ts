/**
 * The team mark (practice logo spec R2, R4, R5): the static "Your team"
 * profile's rules, and the helpers both planners use to draw a team's logo or
 * Crest. Pure and portable.
 */
import { LOGO_IMAGE_MAX_PX, MAX_LOGO_PNG_BYTES } from "@/lib/media/logo-rules";
import { isPngDataUri, pngDataUriByteLength } from "@/lib/utils/png-data-uri";
import { cleanStaffName } from "@/lib/utils/session-staff";
import type { LogoImage, TeamMark, TeamProfile } from "@/types/practice-planner";

export const TEAM_NAME_MAX = 60;
export const TEAM_NAME_REQUIRED_MESSAGE = "Team name is required";
export const TEAM_NAME_LENGTH_MESSAGE = `Team name must be at most ${TEAM_NAME_MAX} characters`;
/** Hosted branding's text (lib/actions/branding.ts). */
export const TEAM_COLOR_MESSAGE = "Use a hex color like #0D47A1";
export const TEAM_LOGO_INVALID_MESSAGE = "The logo must be a PNG of at most 512 × 512 pixels and 200 KB";

/** An export draws the mark this high (spec R2)… */
export const EXPORT_MARK_HEIGHT = 48;
/** …and no wider than this (a wide wordmark is scaled down to fit). */
export const EXPORT_MARK_MAX_WIDTH = 144;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

export interface TeamProfileInput {
    name: string;
    logo: LogoImage | null;
    primaryColor: string | null;
    secondaryColor: string | null;
}

export type TeamProfileField = keyof TeamProfileInput;

/** The same cleaning as a staff name (spec R4): control and invisible characters removed, whitespace collapsed, trimmed. */
export function cleanTeamName(name: string): string {
    return cleanStaffName(name);
}

/** `#RRGGBB` only: the static color fields write six digits. */
export function isTeamColor(value: string): boolean {
    return HEX6.test(value);
}

function isSide(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= LOGO_IMAGE_MAX_PX;
}

/** Every PNG data URL starts so: the 8-byte signature and IHDR's length, base64-encoded. */
const PNG_DATA_URI_START = "data:image/png;base64,iVBORw0KGgo";

/** A normalized logo (spec R2): a PNG data URL, sides 1–512, at most 200 KB decoded. */
export function isLogoImage(value: unknown): value is LogoImage {
    if (typeof value !== "object" || value === null) return false;
    const { dataUrl, width, height } = value as Record<string, unknown>;
    return (
        typeof dataUrl === "string" &&
        dataUrl.startsWith(PNG_DATA_URI_START) &&
        isPngDataUri(dataUrl) &&
        pngDataUriByteLength(dataUrl) <= MAX_LOGO_PNG_BYTES &&
        isSide(width) &&
        isSide(height)
    );
}

export function teamProfileErrors(input: TeamProfileInput): Partial<Record<TeamProfileField, string>> {
    const errors: Partial<Record<TeamProfileField, string>> = {};
    const name = cleanTeamName(typeof input.name === "string" ? input.name : "");
    if (!name) errors.name = TEAM_NAME_REQUIRED_MESSAGE;
    else if (name.length > TEAM_NAME_MAX) errors.name = TEAM_NAME_LENGTH_MESSAGE;
    if (input.logo !== null && !isLogoImage(input.logo)) errors.logo = TEAM_LOGO_INVALID_MESSAGE;
    for (const field of ["primaryColor", "secondaryColor"] as const) {
        const value: unknown = input[field];
        if (value !== null && (typeof value !== "string" || !isTeamColor(value))) errors[field] = TEAM_COLOR_MESSAGE;
    }
    return errors;
}

/** The first problem, in field order, or null. */
export function teamProfileError(input: TeamProfileInput): string | null {
    const errors = teamProfileErrors(input);
    return errors.name ?? errors.logo ?? errors.primaryColor ?? errors.secondaryColor ?? null;
}

/** What the store keeps, for an input teamProfileError accepted. */
export function toTeamProfile(input: TeamProfileInput): TeamProfile {
    return {
        name: cleanTeamName(input.name),
        logo: input.logo ? { dataUrl: input.logo.dataUrl, width: input.logo.width, height: input.logo.height } : null,
        primaryColor: input.primaryColor ? input.primaryColor.toUpperCase() : null,
        secondaryColor: input.secondaryColor ? input.secondaryColor.toUpperCase() : null,
    };
}

/** A stored record, read leniently: a bad name is no profile; a bad logo or color reads as null. */
export function readTeamProfile(raw: unknown): TeamProfile | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? cleanTeamName(record.name) : "";
    if (!name || name.length > TEAM_NAME_MAX) return null;
    const color = (value: unknown) => (typeof value === "string" && isTeamColor(value) ? value.toUpperCase() : null);
    return {
        name,
        logo: isLogoImage(record.logo) ? { dataUrl: record.logo.dataUrl, width: record.logo.width, height: record.logo.height } : null,
        primaryColor: color(record.primaryColor),
        secondaryColor: color(record.secondaryColor),
    };
}

/** The mark a profile draws. `id` seeds the Crest's fallback color (the static planner passes LOCAL_TEAM_ID). */
export function toTeamMark(profile: TeamProfile, id: string): TeamMark {
    return { id, name: profile.name, logoUrl: profile.logo?.dataUrl ?? null, color: profile.primaryColor, logoImage: profile.logo };
}

/** The mark image's alt text (spec R5), from the cleaned name. Callers escape it for their format. */
export function teamLogoAlt(name: string): string {
    return `${cleanTeamName(name)} logo`;
}

/** The size an export draws a logo at: 48 px high, at most 144 px wide, ratio kept. Sides must be positive. */
export function exportMarkSize(image: { width: number; height: number }): { width: number; height: number } {
    const positive = (side: number) => Number.isFinite(side) && side > 0;
    if (!positive(image.width) || !positive(image.height)) throw new RangeError("A logo's sides must be positive numbers");
    const width = Math.round((EXPORT_MARK_HEIGHT * image.width) / image.height);
    if (width <= EXPORT_MARK_MAX_WIDTH) return { width: Math.max(1, width), height: EXPORT_MARK_HEIGHT };
    return { width: EXPORT_MARK_MAX_WIDTH, height: Math.max(1, Math.round((EXPORT_MARK_MAX_WIDTH * image.height) / image.width)) };
}
