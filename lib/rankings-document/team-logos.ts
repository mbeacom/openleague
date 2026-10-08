/**
 * Team logos in a rankings document (hosted rankings and team logos spec, R5).
 * Pure. A logo is a small PNG data URL on the team entry, so a rankings file
 * carries its logos with it and reads the same on the static and hosted apps.
 */
import { pngDataUriByteLength } from "@/lib/utils/png-data-uri";
import { isPngLogo } from "@/lib/utils/team-mark";
import {
    MAX_TEAM_LOGOS_TOTAL_BYTES,
    RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE,
    TEAM_LOGO_BOUNDS,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_LOGOS_TOTAL_MESSAGE,
    fitsRankingsFile,
    type RankingsDocument,
    type RankingsTeamLogo,
} from "./document";

export const TEAM_NOT_IN_RANKINGS_MESSAGE = "That team isn't in these rankings.";

/** Decoded bytes of every team logo in the document. */
export function teamLogoBytes(doc: Pick<RankingsDocument, "teams">): number {
    return doc.teams.reduce((sum, team) => sum + (team.logo ? pngDataUriByteLength(team.logo.dataUrl) : 0), 0);
}

/** The logo of team `number`, or null. */
export function teamLogo(doc: Pick<RankingsDocument, "teams">, number: string): RankingsTeamLogo | null {
    return doc.teams.find((team) => team.number === number)?.logo ?? null;
}

export type WithTeamLogoResult = { ok: true; doc: RankingsDocument } | { ok: false; error: string };

/**
 * Sets (or, with null, removes) team `number`'s logo. Refuses a logo outside
 * the per-logo bounds, one that would take the document's logos past their
 * shared budget, and one that would take the whole rankings file past its cap.
 */
export function withTeamLogo(doc: RankingsDocument, number: string, logo: RankingsTeamLogo | null): WithTeamLogoResult {
    const index = doc.teams.findIndex((team) => team.number === number);
    if (index === -1) return { ok: false, error: TEAM_NOT_IN_RANKINGS_MESSAGE };
    const teams = [...doc.teams];
    const { logo: _previous, ...team } = teams[index];
    if (logo === null) {
        teams[index] = team;
        return { ok: true, doc: { ...doc, teams } };
    }
    if (!isPngLogo(logo, TEAM_LOGO_BOUNDS)) return { ok: false, error: TEAM_LOGO_INVALID_MESSAGE };
    teams[index] = { ...team, logo: { dataUrl: logo.dataUrl, width: logo.width, height: logo.height } };
    if (teamLogoBytes({ teams }) > MAX_TEAM_LOGOS_TOTAL_BYTES) return { ok: false, error: TEAM_LOGOS_TOTAL_MESSAGE };
    // The logo budget alone doesn't bound the file: a near-limit document could gain a logo and then not export or reopen.
    const candidate = { ...doc, teams };
    if (!fitsRankingsFile(candidate)) return { ok: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE };
    return { ok: true, doc: candidate };
}
