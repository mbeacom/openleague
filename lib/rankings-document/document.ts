/**
 * The portable rankings document (static rankings spec; ADR-0020 conventions):
 * one versioned JSON format for the static app's storage, export and import.
 * Pure. Parsing strips unknown keys; a newer version is refused with its own
 * message; `snapshots` is reserved for phase 2 and kept as-is.
 */
import { z } from "zod";
import { CSHL_8U_METHOD, type RatingGame, type RatingMethod, type RatingTeam } from "@/lib/ratings";

export const RANKINGS_FORMAT = "openleague.rankings" as const;
export const RANKINGS_VERSION = 1 as const;
export const MAX_RANKINGS_FILE_BYTES = 2_000_000;
const MAX_TEAMS = 400;
const MAX_GAMES = 5000;

export const NOT_RANKINGS_MESSAGE = "This file isn't an OpenLeague rankings file.";
export const NEWER_RANKINGS_MESSAGE = "This rankings file was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_RANKINGS_MESSAGE = "This rankings file has problems and can't be opened.";

const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (text: string) => text.replace(CONTROL, "").trim();

/** Bring imported text within the schema's rules: strip control characters, trim, truncate to `max`. */
export const cleanImportedText = (text: string | null | undefined, max: number): string => clean(text ?? "").slice(0, max).trim();

const requiredText = (max: number, label: string) =>
    z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));

const optionalText = (max: number, label: string) =>
    z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
        .nullish()
        .transform((value) => (value ? value : null));

const teamNumber = z.string({ message: "Team number must be text" }).regex(/^[A-Za-z0-9]{1,8}$/, "Team number must be 1–8 letters or digits");
const goals = z.number({ message: "Goals must be a number" }).int("Goals must be whole numbers").min(0).max(99);

const gameSchema = z
    .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        time: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM")
            .nullish()
            .transform((value) => value ?? null),
        home: teamNumber,
        away: teamNumber,
        homeGoals: goals.nullish().transform((value) => value ?? null),
        awayGoals: goals.nullish().transform((value) => value ?? null),
        status: z.enum(["final", "scheduled"], { message: "Status must be final or scheduled" }),
        rink: optionalText(100, "Rink"),
    })
    .superRefine((game, ctx) => {
        if (game.home === game.away) ctx.addIssue({ code: "custom", message: "A team can't play itself" });
        const scored = game.homeGoals !== null && game.awayGoals !== null;
        const unscored = game.homeGoals === null && game.awayGoals === null;
        if (game.status === "final" && !scored) ctx.addIssue({ code: "custom", message: "A final game needs both scores" });
        if (game.status === "scheduled" && !unscored) ctx.addIssue({ code: "custom", message: "A scheduled game has no score" });
    });

const teamSchema = z.object({
    number: teamNumber,
    name: requiredText(100, "Team name"),
    startingBracket: optionalText(40, "Starting bracket"),
    excluded: z.boolean().optional().transform((value) => value ?? false),
});

const methodSchema = z.object({
    preset: requiredText(40, "Preset"),
    goalCap: z.number().int().min(1, "Goal cap must be 1–20").max(20, "Goal cap must be 1–20"),
    walkush: z.object({ variant: z.literal("plus-one") }),
    lowConfidenceGames: z.number().int().min(0).max(20),
    levels: z
        .array(z.object({ name: requiredText(20, "Level name"), size: z.number().int().min(1, "Level size must be at least 1").max(200) }))
        .min(1, "Add at least one level")
        .max(20),
});

const rankingsSchema = z
    .object({
        format: z.literal(RANKINGS_FORMAT),
        version: z.literal(RANKINGS_VERSION),
        meta: z.object({
            title: requiredText(100, "Title"),
            ageGroup: optionalText(20, "Age group"),
            seasonLabel: optionalText(20, "Season"),
            source: optionalText(500, "Source"),
        }),
        method: methodSchema,
        teams: z.array(teamSchema).max(MAX_TEAMS, `At most ${MAX_TEAMS} teams`),
        games: z.array(gameSchema).max(MAX_GAMES, `At most ${MAX_GAMES} games`),
        myTeam: teamNumber.nullish().transform((value) => value ?? null),
        snapshots: z.array(z.unknown()).optional().transform((value) => value ?? []),
    })
    .superRefine((doc, ctx) => {
        const seen = new Set<string>();
        doc.teams.forEach((team, i) => {
            if (seen.has(team.number)) ctx.addIssue({ code: "custom", path: ["teams", i, "number"], message: `Team ${team.number} is listed twice` });
            seen.add(team.number);
        });
        doc.games.forEach((game, i) => {
            if (!seen.has(game.home)) ctx.addIssue({ code: "custom", path: ["games", i, "home"], message: `Team ${game.home} isn't in the team list` });
            if (!seen.has(game.away)) ctx.addIssue({ code: "custom", path: ["games", i, "away"], message: `Team ${game.away} isn't in the team list` });
        });
        if (doc.myTeam !== null && !seen.has(doc.myTeam)) ctx.addIssue({ code: "custom", path: ["myTeam"], message: "Your team isn't in the team list" });
    });

export type RankingsDocument = z.output<typeof rankingsSchema>;
export type RankingsGame = RankingsDocument["games"][number];
export type RankingsTeam = RankingsDocument["teams"][number];

export interface RankingsError {
    code: "not-rankings" | "newer-version" | "invalid";
    message: string;
    issues?: string[];
}

export type ParseRankingsResult = { ok: true; doc: RankingsDocument } | { ok: false; error: RankingsError };

export function parseRankings(raw: unknown): ParseRankingsResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { format?: unknown }).format !== RANKINGS_FORMAT) {
        return { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > RANKINGS_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_RANKINGS_MESSAGE } };
    }
    const result = rankingsSchema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            error: { code: "invalid", message: INVALID_RANKINGS_MESSAGE, issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) },
        };
    }
    return { ok: true, doc: result.data };
}

export function createRankingsDocument({ title, method = CSHL_8U_METHOD }: { title: string; method?: RatingMethod }): RankingsDocument {
    return {
        format: RANKINGS_FORMAT,
        version: RANKINGS_VERSION,
        meta: { title: clean(title) || "Pre-season rankings", ageGroup: null, seasonLabel: null, source: null },
        method: structuredClone(method),
        teams: [],
        games: [],
        myTeam: null,
        snapshots: [],
    };
}

export function serializeRankings(doc: RankingsDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

export function rankingsFileName(doc: RankingsDocument): string {
    const slug = doc.meta.title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "");
    return `${slug || "rankings"}.rankings.json`;
}

export function toRatingInputs(doc: RankingsDocument): { games: RatingGame[]; teams: RatingTeam[] } {
    return {
        games: doc.games
            .filter((game) => game.status === "final")
            .map((game) => ({ home: game.home, away: game.away, homeGoals: game.homeGoals!, awayGoals: game.awayGoals! })),
        teams: doc.teams.map((team) => ({ number: team.number, name: team.name, startingBracket: team.startingBracket, excluded: team.excluded })),
    };
}
