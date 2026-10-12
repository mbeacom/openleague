/** Team colors in the practice planner: the header palette and the opt-in diagram remap. */
import { describe, expect, it } from "vitest";
import { getContrastRatio } from "@mui/material/styles";
import {
    DEFAULT_TEAM_PALETTE,
    GRAPHIC_CONTRAST,
    TEXT_CONTRAST,
    sessionWithTeamColors,
    teamColorPlayData,
    teamPalette,
    teamRoleColors,
} from "@/lib/utils/team-palette";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";
import type { PlayData, PlayerIcon, PlayerRole } from "@/types/practice-planner";

const WHITE = "#FFFFFF";

const mark = (color: string | null, secondaryColor: string | null = null) => ({ id: "t1", name: "Ice Hawks", logoUrl: null, color, secondaryColor });

const player = (role: PlayerRole, color = ROLE_DEFAULT_COLORS[role], id: string = role): PlayerIcon => ({ id, role, label: "", color, position: { x: 10, y: 10 } });

const playData = (players: PlayerIcon[]): PlayData =>
    ({ version: 1, area: { preset: "full" }, players, drawings: [], equipment: [] }) as unknown as PlayData;

describe("teamPalette", () => {
    it("falls back to League Blue and Action Blue without a team or its colors", () => {
        expect(teamPalette(null)).toEqual(DEFAULT_TEAM_PALETTE);
        expect(teamPalette(undefined)).toEqual(DEFAULT_TEAM_PALETTE);
        expect(teamPalette(mark(null))).toEqual(DEFAULT_TEAM_PALETTE);
        expect(DEFAULT_TEAM_PALETTE).toMatchObject({ band: "#0D47A1", accent: "#1976D2", onBand: WHITE, fromTeam: false });
    });

    it("ignores a color that is not hex", () => {
        expect(teamPalette(mark("red", "javascript:alert(1)"))).toEqual(DEFAULT_TEAM_PALETTE);
    });

    it("uses a dark primary as the band, with white text, and the secondary as the accent", () => {
        const palette = teamPalette(mark("#7A0019", "#1B5E20"));
        expect(palette.fromTeam).toBe(true);
        expect(palette.band).toBe("#7A0019");
        expect(palette.onBand).toBe(WHITE);
        expect(palette.accent).toBe("#1B5E20");
        expect(palette.gradient).toContain("#7A0019");
        expect(palette.gradient).toContain("#1B5E20");
    });

    it("accepts the 3-digit form and normalizes to #RRGGBB", () => {
        expect(teamPalette(mark("#036")).band).toBe("#003366");
    });

    it("uses the band as the accent when there is no secondary", () => {
        const palette = teamPalette(mark("#003366"));
        expect(palette.accent).toBe("#003366");
    });

    it("darkens a pale primary until it reads on white paper", () => {
        const palette = teamPalette(mark("#FFD700"));
        expect(palette.fromTeam).toBe(true);
        expect(palette.band).not.toBe("#FFD700");
        expect(getContrastRatio(palette.band, WHITE)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    });

    it("darkens a pale secondary for the accent, or falls back to the band", () => {
        const palette = teamPalette(mark("#003366", "#FFF59D"));
        expect(getContrastRatio(palette.accent, WHITE)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
        // White barely darkens into anything: the accent falls back to the band.
        expect(teamPalette(mark("#003366", "#FFFFFF")).accent).toBe("#003366");
    });

    it.each(["#0D47A1", "#7A0019", "#FFD700", "#4A7FBF", "#FFFFFF", "#000000", "#00FF00", "#808080"])(
        "keeps every pairing above its contrast floor for %s",
        (primary) => {
            const palette = teamPalette(mark(primary, primary));
            expect(getContrastRatio(palette.onBand, palette.band)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
            expect(getContrastRatio(palette.band, WHITE)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
            expect(getContrastRatio(palette.accent, WHITE)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
            expect(getContrastRatio(palette.ink, palette.tint)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
            expect(getContrastRatio(palette.ink, WHITE)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
            for (const color of [palette.band, palette.onBand, palette.accent, palette.ink, palette.tint]) {
                expect(color).toMatch(/^#[0-9A-F]{6}$/);
            }
        },
    );

    it("falls back to League Blue when white cannot be darkened into a band", () => {
        expect(teamPalette(mark("#FFFFFF"))).toEqual(DEFAULT_TEAM_PALETTE);
    });
});

describe("teamRoleColors", () => {
    it("maps the primary to skaters and forwards and the secondary to defense", () => {
        expect(teamRoleColors(mark("#7A0019", "#1B5E20"))).toEqual({ X: "#7A0019", F: "#7A0019", D: "#1B5E20" });
    });

    it("never maps the opponent, goalie or coach", () => {
        const colors = teamRoleColors(mark("#7A0019", "#1B5E20"));
        expect(colors.O).toBeUndefined();
        expect(colors.G).toBeUndefined();
        expect(colors.C).toBeUndefined();
    });

    it("leaves a role at its default when its color is missing, pale on the ice or close to the opponent red", () => {
        expect(teamRoleColors(mark("#7A0019"))).toEqual({ X: "#7A0019", F: "#7A0019" });
        expect(teamRoleColors(mark("#FFD700", "#1B5E20"))).toEqual({ D: "#1B5E20" });
        expect(teamRoleColors(mark("#C8102E", "#1B5E20"))).toEqual({ D: "#1B5E20" });
        expect(teamRoleColors(null)).toEqual({});
    });

    it("keeps every mapped color at least 3:1 on white ice", () => {
        for (const primary of ["#0D47A1", "#4A7FBF", "#808080", "#00A0FF", "#7A0019"]) {
            for (const color of Object.values(teamRoleColors(mark(primary, primary)))) {
                expect(getContrastRatio(color, WHITE)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
            }
        }
    });
});

describe("teamColorPlayData", () => {
    const colors = { X: "#7A0019", F: "#7A0019", D: "#1B5E20" };

    it("recolors only markers still holding their role's default color", () => {
        const data = playData([player("X"), player("D"), player("F", "#123456", "f-custom"), player("O"), player("G")]);
        const shown = teamColorPlayData(data, colors);
        expect(shown.players.map((p) => p.color)).toEqual(["#7A0019", "#1B5E20", "#123456", ROLE_DEFAULT_COLORS.O, ROLE_DEFAULT_COLORS.G]);
    });

    it("matches the default color case-insensitively", () => {
        const shown = teamColorPlayData(playData([player("X", ROLE_DEFAULT_COLORS.X.toLowerCase())]), colors);
        expect(shown.players[0].color).toBe("#7A0019");
    });

    it("never changes the stored diagram, and returns it as is when nothing changes", () => {
        const data = playData([player("X"), player("O")]);
        const before = JSON.stringify(data);
        teamColorPlayData(data, colors);
        expect(JSON.stringify(data)).toBe(before);
        const untouched = playData([player("O"), player("C")]);
        expect(teamColorPlayData(untouched, colors)).toBe(untouched);
        expect(teamColorPlayData(data, {})).toBe(data);
        expect(teamColorPlayData(null, colors)).toBeNull();
    });
});

describe("sessionWithTeamColors", () => {
    const colors = { X: "#7A0019" };

    it("recolors each drill's diagram and passes block rows through", () => {
        const block = { kind: "warmup" as const, sequence: 0 };
        const drill = { sequence: 1, play: { name: "Breakout", playData: playData([player("X")]) } };
        const session = { plays: [block, drill] };
        const shown = sessionWithTeamColors(session, colors);
        expect(shown).not.toBe(session);
        expect(shown.plays[0]).toBe(block);
        expect((shown.plays[1] as typeof drill).play.playData?.players[0].color).toBe("#7A0019");
        expect(drill.play.playData?.players[0].color).toBe(ROLE_DEFAULT_COLORS.X);
    });

    it("returns the session itself when nothing changes", () => {
        const session = { plays: [{ play: { playData: playData([player("O")]) } }] };
        expect(sessionWithTeamColors(session, colors)).toBe(session);
        expect(sessionWithTeamColors(session, {})).toBe(session);
    });
});
