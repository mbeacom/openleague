/**
 * The portable team file (practice logo spec R4a; ADR-0020 conventions): the
 * static planner's "Your team" profile as a versioned document, so a coach can
 * carry it to another device. Pure. Parsing keeps only known keys, refuses a
 * newer version with its own message, and holds the team to the same rules as
 * the Your team dialog. Plan files still never carry the profile.
 */
import { z } from "zod";
import { teamProfileErrors, toTeamProfile, type TeamProfileInput } from "@/lib/utils/team-mark";
import type { TeamProfile } from "@/types/practice-planner";

export const TEAM_PROFILE_FORMAT = "openleague.team-profile" as const;
export const TEAM_PROFILE_VERSION = 1 as const;
/** The largest team file, bare: a 200 KB logo as a data URL is about 273 KB, plus the name and colors. */
export const MAX_TEAM_PROFILE_FILE_BYTES = 300_000;

export const NOT_A_TEAM_FILE_MESSAGE = "This file isn't an OpenLeague team file.";
export const NEWER_TEAM_FILE_MESSAGE = "This team file was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_TEAM_FILE_MESSAGE = "This team file has problems and can't be opened.";
export const TEAM_FILE_TOO_LARGE_MESSAGE = `This file is too large to be a team file (the limit is ${MAX_TEAM_PROFILE_FILE_BYTES / 1000} KB).`;

export interface TeamProfileDocument {
    format: typeof TEAM_PROFILE_FORMAT;
    version: typeof TEAM_PROFILE_VERSION;
    /** When the file was made; null when a file leaves it out. */
    exportedAt: string | null;
    team: TeamProfile;
}

export interface TeamProfileFileError {
    code: "not-a-team-file" | "newer-version" | "invalid";
    message: string;
    issues?: string[];
}

export type ParseTeamProfileResult = { ok: true; doc: TeamProfileDocument } | { ok: false; error: TeamProfileFileError };

const isoDateTime = z.iso.datetime({ offset: true });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (issues: string[]): ParseTeamProfileResult => ({ ok: false, error: { code: "invalid", message: INVALID_TEAM_FILE_MESSAGE, issues } });

export function parseTeamProfileDocument(raw: unknown): ParseTeamProfileResult {
    if (!isRecord(raw) || raw.format !== TEAM_PROFILE_FORMAT) {
        return { ok: false, error: { code: "not-a-team-file", message: NOT_A_TEAM_FILE_MESSAGE } };
    }
    const version = raw.version;
    if (typeof version === "number" && Number.isInteger(version) && version > TEAM_PROFILE_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_TEAM_FILE_MESSAGE } };
    }
    if (version !== TEAM_PROFILE_VERSION) return invalid([`version: Version must be ${TEAM_PROFILE_VERSION}`]);

    const exportedAt = raw.exportedAt ?? null;
    if (exportedAt !== null && !isoDateTime.safeParse(exportedAt).success) return invalid(["exportedAt: Must be a date and time"]);

    if (!isRecord(raw.team)) return invalid(["team: Team is required"]);
    const team = raw.team;
    // TOML has no null, so a missing logo or color reads as none.
    const input = {
        name: team.name,
        logo: team.logo ?? null,
        primaryColor: team.primaryColor ?? null,
        secondaryColor: team.secondaryColor ?? null,
    } as TeamProfileInput;
    const errors = teamProfileErrors(input);
    const issues = Object.entries(errors).map(([field, message]) => `team.${field}: ${message}`);
    if (issues.length > 0) return invalid(issues);

    return { ok: true, doc: { format: TEAM_PROFILE_FORMAT, version: TEAM_PROFILE_VERSION, exportedAt: exportedAt as string | null, team: toTeamProfile(input) } };
}

export function createTeamProfileDocument(team: TeamProfile, now: Date = new Date()): TeamProfileDocument {
    return { format: TEAM_PROFILE_FORMAT, version: TEAM_PROFILE_VERSION, exportedAt: now.toISOString(), team: toTeamProfile(team) };
}

export function serializeTeamProfileDocument(doc: TeamProfileDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/** "ice-hawks.team.json": the team name as a slug, or "team". */
export function teamProfileFileName(team: Pick<TeamProfile, "name">): string {
    const slug = team.name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "");
    return `${slug || "team"}.team.json`;
}
