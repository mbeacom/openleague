import { describe, expect, it } from "vitest";
import { parseNameList, redact } from "@/lib/ai/redact";

const STAFF = { label: "Coach", names: ["Alex Morgan", "Sam"] };
const PLAYERS = { label: "Player", names: ["Jordan", "Riley Park"] };

describe("redact", () => {
    it("replaces listed names and restores them (round trip)", () => {
        const notes = "Alex Morgan runs the warm-up. Jordan and Riley Park in net. Sam on the bench with Jordan.";
        const result = redact(notes, [STAFF, PLAYERS]);
        expect(result.text).toBe("Coach 1 runs the warm-up. Player 1 and Player 2 in net. Coach 2 on the bench with Player 1.");
        expect(result.restore(result.text)).toBe(notes);
        expect(result.replacements).toEqual([
            { placeholder: "Coach 1", original: "Alex Morgan", count: 1 },
            { placeholder: "Player 1", original: "Jordan", count: 2 },
            { placeholder: "Player 2", original: "Riley Park", count: 1 },
            { placeholder: "Coach 2", original: "Sam", count: 1 },
        ]);
    });

    it("ignores case, and restores the spelling first seen", () => {
        const result = redact("jordan passes to JORDAN", [PLAYERS]);
        expect(result.text).toBe("Player 1 passes to Player 1");
        expect(result.restore("Player 1 shoots")).toBe("jordan shoots");
        expect(result.restore("player 1 shoots")).toBe("jordan shoots");
    });

    it("matches whole words only", () => {
        const result = redact("Samuel and Sam's line; Samantha; Sam-led drill; SAM.", [STAFF]);
        expect(result.text).toBe("Samuel and Coach 1's line; Samantha; Coach 1-led drill; Coach 1.");
    });

    it("prefers the longer of overlapping names", () => {
        const result = redact("Sam Lee and Sam", [{ label: "Coach", names: ["Sam", "Sam Lee"] }]);
        expect(result.text).toBe("Coach 1 and Coach 2");
        expect(result.restore(result.text)).toBe("Sam Lee and Sam");
    });

    it("replaces a name inside a drill name only on word boundaries", () => {
        const result = redact("Hilltop breakout, then Hilltopper relay with Hill", [{ label: "Player", names: ["Hill", "Hilltop"] }]);
        expect(result.text).toBe("Player 1 breakout, then Hilltopper relay with Player 2");
    });

    it("skips a placeholder the text already uses", () => {
        const result = redact("Player 1 is a drill station. Jordan skates.", [PLAYERS]);
        expect(result.text).toBe("Player 1 is a drill station. Player 2 skates.");
        expect(result.restore(result.text)).toBe("Player 1 is a drill station. Jordan skates.");
    });

    it("doesn't confuse Player 1 with Player 12 when restoring", () => {
        const names = Array.from({ length: 12 }, (_, i) => `Name${String.fromCharCode(65 + i)}`);
        const result = redact(names.join(" "), [{ label: "Player", names }]);
        expect(result.restore("Player 12 then Player 1")).toBe("NameL then NameA");
    });

    it("escapes regular-expression characters in names", () => {
        const result = redact("Ann (C) and Ann", [{ label: "Coach", names: ["Ann (C)"] }]);
        expect(result.text).toBe("Coach 1 and Ann");
    });

    it("gives segments for highlighting", () => {
        const result = redact("Hi Jordan!", [PLAYERS]);
        expect(result.segments).toEqual([{ text: "Hi " }, { text: "Player 1", placeholder: "Player 1", original: "Jordan" }, { text: "!" }]);
    });

    it("leaves text alone with no names", () => {
        const result = redact("Just drills", [{ label: "Coach", names: [" ", ""] }]);
        expect(result.text).toBe("Just drills");
        expect(result.restore("Coach 1")).toBe("Coach 1");
    });
});

describe("parseNameList", () => {
    it("splits on lines, commas and semicolons, trims and drops repeats", () => {
        expect(parseNameList(" Jordan\nRiley  Park, Jordan;\n\n")).toEqual(["Jordan", "Riley Park"]);
    });
});
