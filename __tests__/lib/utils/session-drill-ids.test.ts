import { describe, expect, it } from "vitest";
import { applySavedPlayIds, describeSaveError, upsertSessionDrill } from "@/lib/utils/session-drill-ids";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

function card(id: string, playId: string, sequence = 0): PlayInSession {
    return { id, playId, name: id, sequence, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

describe("applySavedPlayIds", () => {
    it("swaps each card's playId for the owned id the save returned", () => {
        const plays = [card("k1", "lib"), card("k2", "owned")];
        const sent = new Map([["k1", "lib"], ["k2", "owned"]]);
        const next = applySavedPlayIds(plays, sent, [{ clientKey: "k1", playId: "copy" }, { clientKey: "k2", playId: "owned" }]);
        expect(next.map((p) => p.playId)).toEqual(["copy", "owned"]);
    });

    it("keeps a card whose playId changed while the save was in flight", () => {
        const plays = [card("k1", "forked-by-dialog")];
        const sent = new Map([["k1", "lib"]]);
        const next = applySavedPlayIds(plays, sent, [{ clientKey: "k1", playId: "autosave-copy" }]);
        expect(next[0].playId).toBe("forked-by-dialog");
    });

    it("ignores unknown clientKeys and a missing mapping", () => {
        const plays = [card("k1", "lib")];
        expect(applySavedPlayIds(plays, new Map([["k1", "lib"]]), [{ clientKey: "zz", playId: "x" }])).toEqual(plays);
        expect(applySavedPlayIds(plays, new Map(), undefined)).toBe(plays);
    });
});

describe("upsertSessionDrill", () => {
    const patch = { playId: "new", name: "Breakout", description: "d", thumbnail: "t", playData: createEmptyPlayData() };

    it("updates the matching card's drill fields, keeping duration and instructions", () => {
        const plays = [{ ...card("k1", "lib"), duration: 12, instructions: "Hard" }];
        const next = upsertSessionDrill(plays, "k1", patch);
        expect(next[0]).toMatchObject({ playId: "new", name: "Breakout", duration: 12, instructions: "Hard" });
    });

    it("appends a new card at max sequence + 1", () => {
        const next = upsertSessionDrill([card("a", "x", 0), card("b", "y", 2)], "k9", patch);
        expect(next[2]).toMatchObject({ id: "k9", playId: "new", sequence: 3, duration: 10, instructions: "" });
    });
});

describe("describeSaveError", () => {
    const STALE = "One or more drills not found or do not belong to this session";

    it("adds reload guidance to the stale-drill rejection, keeping the server text verbatim", () => {
        expect(describeSaveError(STALE)).toBe(`${STALE}. Reload the page to get the latest drills.`);
    });

    it("leaves every other error untouched", () => {
        expect(describeSaveError("Failed to save practice session")).toBe("Failed to save practice session");
        expect(describeSaveError(`${STALE} (extra)`)).toBe(`${STALE} (extra)`);
    });
});
