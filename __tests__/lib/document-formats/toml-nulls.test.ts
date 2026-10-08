/**
 * TOML has no null: only nulls at a kind's schema-owned optional paths may be
 * left out (the schema reads a missing value as null). A null anywhere else,
 * such as inside data a kind keeps as-is, would be lost, so the export refuses.
 */
import { describe, expect, it } from "vitest";
import { DocumentEncodeError, TOML_CANNOT_HOLD_MESSAGE, encodeDocument, readAnyDocumentText, stripNullsForToml } from "@/lib/document-formats";
import { PLAN_FORMAT, serializePlan } from "@/lib/plan-document";
import { RANKINGS_FORMAT, parseRankings } from "@/lib/rankings-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { sampleRankingsDoc } from "../../apps/planner/rankings-fixtures";

const plan = () =>
    serializePlan(
        {
            title: "Lakeview practice",
            durationMinutes: 30,
            date: null,
            startTime: null,
            goaliesAttending: null,
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Laps", description: null, playData: createEmptyPlayData() },
                { kind: "break", sequence: 1, duration: 3, runsWithPrevious: false, instructions: null, label: null },
            ],
        },
        "openleague-static",
        new Date("2026-10-07T18:00:00.000Z"),
    );

describe("TOML nulls are schema-aware", () => {
    it("refuses a null inside a rankings file's kept-as-is snapshots instead of dropping it", async () => {
        const doc = sampleRankingsDoc({ snapshots: [{ rating: null, team: "901" }] });
        await expect(encodeDocument(doc, "toml")).rejects.toThrow(DocumentEncodeError);
        await expect(encodeDocument(doc, "toml")).rejects.toThrow(TOML_CANNOT_HOLD_MESSAGE);
    });

    it("refuses a null inside a drill diagram, which the plan keeps as-is", async () => {
        const doc = plan();
        const drill = doc.session.drills[0];
        if (drill.kind !== "drill") throw new Error("fixture");
        (drill.drill.playData.players as unknown[]).push({ id: "p1", position: { x: 1, y: 1 }, role: "F", label: null, color: "#000000" });
        await expect(encodeDocument(doc, "toml")).rejects.toThrow(TOML_CANNOT_HOLD_MESSAGE);
    });

    it("refuses any null in a document of no known kind", () => {
        expect(() => stripNullsForToml({ a: null })).toThrow(TOML_CANNOT_HOLD_MESSAGE);
    });

    it("still leaves out nulls at the schema's own optional fields, and they read back as null", async () => {
        const doc = sampleRankingsDoc({ meta: { title: "Fall", ageGroup: null, seasonLabel: null, source: null }, myTeam: null });
        const text = await encodeDocument(doc, "toml");
        expect(text).not.toMatch(/ageGroup|myTeam/);
        const result = await readAnyDocumentText(text, "fall.rankings.toml", undefined, { kind: RANKINGS_FORMAT });
        const expected = parseRankings(JSON.parse(JSON.stringify(doc)));
        expect(result.ok && expected.ok && result.document.payload).toEqual(expected.ok && expected.doc);
    });

    it("leaves out a plan's optional nulls, wrapped in an envelope or not", async () => {
        const doc = plan();
        const bare = stripNullsForToml(JSON.parse(JSON.stringify(doc))) as { session: Record<string, unknown> };
        expect(bare.session).not.toHaveProperty("date");
        expect(bare.session).not.toHaveProperty("goaliesAttending");
        const wrapped = { format: "openleague.document", envelope: 1, kind: PLAN_FORMAT, version: 1, payload: JSON.parse(JSON.stringify(doc)) };
        expect(() => stripNullsForToml(wrapped)).not.toThrow();
        const result = await readAnyDocumentText(await encodeDocument(doc, "toml"), "x.olplan.toml", undefined, { kind: PLAN_FORMAT });
        expect(result.ok && result.document.payload.session.date).toBeNull();
    });

    it("refuses a null inside a list", () => {
        const doc = { ...sampleRankingsDoc(), bracketOrder: ["Red", null] };
        expect(() => stripNullsForToml(JSON.parse(JSON.stringify(doc)))).toThrow(DocumentEncodeError);
    });
});
