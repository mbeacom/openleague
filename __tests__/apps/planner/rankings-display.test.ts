// __tests__/apps/planner/rankings-display.test.ts
import { describe, expect, it } from "vitest";
import { LEVEL_BAND_RAMP, levelBandAlpha, levelText, type ColorScheme } from "@/apps/planner/src/screens/rankings/display";

describe("levelBandAlpha", () => {
    it.each<ColorScheme>(["light", "dark"])("steps strictly down from the top level in %s", (scheme) => {
        const alphas = Array.from({ length: 7 }, (_v, i) => levelBandAlpha(scheme, i, 7));
        for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1]);
        expect(alphas[0]).toBeCloseTo(LEVEL_BAND_RAMP[scheme].strongest, 9);
        expect(alphas[6]).toBeCloseTo(LEVEL_BAND_RAMP[scheme].weakest, 9);
    });

    it("is stronger on dark than on light at every level", () => {
        for (let i = 0; i < 7; i++) expect(levelBandAlpha("dark", i, 7)).toBeGreaterThan(levelBandAlpha("light", i, 7));
    });

    it("gives a single level the strongest band", () => {
        expect(levelBandAlpha("light", 0, 1)).toBe(LEVEL_BAND_RAMP.light.strongest);
    });
});

describe("levelText", () => {
    const row = { level: null, rank: null, games: 0, excluded: false };
    it("explains a missing level", () => {
        expect(levelText({ ...row, level: "R1", rank: 1, games: 4 })).toBe("R1");
        expect(levelText(row)).toBe("No games yet");
        expect(levelText({ ...row, excluded: true })).toBe("Excluded");
        expect(levelText({ ...row, rank: 9, games: 4 })).toBe("Below the last level");
    });
});
