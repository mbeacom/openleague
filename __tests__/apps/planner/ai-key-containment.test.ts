/**
 * Key containment (ADR-0023, spec R5 and Testing): with a sentinel key, the
 * notes task runs through each real adapter (against a recording fetch, never
 * the network), the draft is saved, and every export path is produced. The
 * sentinel appears in exactly one header of exactly one request, to the
 * provider's own origin, and nowhere else: not in any stored record, plan
 * file, decoded plan link, bench sheet, Word document or rankings file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProvider } from "@/lib/ai/providers";
import { buildNotesRequest, parseNotesReply } from "@/lib/ai/tasks/notes-to-plan";
import type { AiEvent, ProviderConfig } from "@/lib/ai/types";
import { resolveAiOrigins } from "@/apps/planner/ai-origins";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_AI_SETTINGS, META_PERSIST_REQUESTED, META_RANKINGS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, META_TEAM_PROFILE, META_THUMBNAIL_STYLE } from "@/apps/planner/src/store/records";
import { DEFAULT_AI_SETTINGS } from "@/apps/planner/src/ai/settings";
import { getKey, resetKeyHolderForTests, setKey } from "@/apps/planner/src/ai/key-holder";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { buildBenchSheetModel } from "@/components/features/practice-planner/export/bench-sheet-model";
import { renderBenchSheetHtml } from "@/components/features/practice-planner/export/bench-sheet-html";
import { renderBenchSheetDocxBytes } from "@/components/features/practice-planner/export/bench-sheet-docx";
import { encodePlanLink, readPlanLink } from "@/lib/plan-document";
import { createRankingsDocument, serializeRankings } from "@/lib/rankings-document/document";
import { unzipEntry } from "@/__tests__/helpers/zip";
import { REPOS, openHarness } from "./store-harness";
import { draftReply } from "../../helpers/ai";
import { recordingFetch, sseResponse } from "../../lib/ai/fixtures";

const SENTINEL = "sk-SENTINEL-do-not-leak-7f3a9c";
const ORIGINS = resolveAiOrigins(undefined);
const PNG = "data:image/png;base64,AA==";

/** A reply stream in each vendor's format carrying the given text. */
function replyFor(kind: ProviderConfig["kind"], text: string): string {
    const data = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
    if (kind === "anthropic") {
        return (
            `event: message_start\n${data({ type: "message_start", message: { usage: { input_tokens: 1 } } })}` +
            `event: content_block_delta\n${data({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}` +
            `event: message_delta\n${data({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } })}` +
            `event: message_stop\n${data({ type: "message_stop" })}`
        );
    }
    if (kind === "openai") {
        return data({ type: "response.output_text.delta", delta: text }) + data({ type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 1 } } });
    }
    return data({ choices: [{ index: 0, delta: { content: text }, finish_reason: "stop" }] }) + "data: [DONE]\n\n";
}

const CASES: Array<[string, ProviderConfig, string, string]> = [
    ["anthropic", { kind: "anthropic", apiKey: "" }, "https://api.anthropic.com", "x-api-key"],
    ["openai", { kind: "openai", apiKey: "" }, "https://api.openai.com", "authorization"],
    ["openai-compatible", { kind: "openai-compatible", apiKey: "", baseUrl: "http://localhost:11434/v1" }, "http://localhost:11434", "authorization"],
];

beforeEach(() => resetKeyHolderForTests());
afterEach(() => resetKeyHolderForTests());

describe.each(REPOS)("the key stays contained (%s store)", (_repoName, open) => {
    it.each(CASES)("%s: the sentinel is in one header of one request, and in no stored record or export", async (_kind, base, origin, header) => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        setKey(base.kind, SENTINEL);
        await store.saveAiSettings({ ...DEFAULT_AI_SETTINGS, enabled: true, active: base.kind, apiKey: SENTINEL } as never);

        // The task, end to end, through the real adapter.
        const recorder = recordingFetch(() => sseResponse(replyFor(base.kind, draftReply())));
        const provider = createProvider({ ...base, apiKey: getKey(base.kind) }, { allowedOrigins: ORIGINS, fetch: recorder.fetchImpl });
        const { request, redaction } = buildNotesRequest({ notes: "Warm-up, then 3-Man Weave.", model: "m", staffNames: [], otherNames: [] });
        const events: AiEvent[] = [];
        for await (const event of provider.send(request, new AbortController().signal)) events.push(event);
        const done = events[events.length - 1];
        if (done.type !== "done") throw new Error(`expected done, got ${JSON.stringify(done)}`);
        const parsed = parseNotesReply(done.text, redaction.restore);
        if (!parsed.ok) throw new Error(parsed.issues.join("\n"));

        // One request, to the provider's origin, with the key in exactly one header.
        expect(recorder.calls).toHaveLength(1);
        const [call] = recorder.calls;
        expect(call.url.startsWith(origin)).toBe(true);
        const holding = Object.entries(call.headers).filter(([, value]) => value.includes(SENTINEL));
        expect(holding.map(([name]) => name)).toEqual([header]);
        expect(call.url).not.toContain(SENTINEL);
        expect(JSON.stringify(call.body)).not.toContain(SENTINEL);
        expect(JSON.stringify(events)).not.toContain(SENTINEL);

        // Saved through the import, then every export path.
        const imported = await store.importPlan(parsed.plan, { date: new Date("2026-10-13T17:30:00"), addToLibrary: true });
        if (!imported.success) throw new Error(imported.error);
        const view = await store.getSessionView(imported.data.sessionId);
        if (!view.success) throw new Error(view.error);
        const planFile = JSON.stringify(buildPlanDocument(view.data, new Date("2026-10-07T12:00:00Z"), "openleague-static"));
        const linkValue = await encodePlanLink(JSON.parse(planFile));
        const fromLink = await readPlanLink(linkValue);
        const model = buildBenchSheetModel(view.data, { diagram: () => PNG, swatch: () => PNG, crest: () => PNG });
        const benchHtml = renderBenchSheetHtml(model);
        const docx = new TextDecoder().decode(unzipEntry(await renderBenchSheetDocxBytes(model), "word/document.xml") ?? new Uint8Array());
        const rankingsSaved = await store.saveRankings(createRankingsDocument({ title: "Riverside 9U ladder" }));
        if (!rankingsSaved.success) throw new Error(rankingsSaved.error);
        const rankingsFile = serializeRankings(rankingsSaved.data);

        expect(planFile).toContain("3-Man Weave");
        expect(benchHtml).toContain("3-Man Weave");
        expect(docx).toContain("3-Man Weave");
        for (const text of [planFile, linkValue, JSON.stringify(fromLink), benchHtml, docx, rankingsFile]) {
            expect(text).not.toContain(SENTINEL);
        }

        // No store holds it: plays, sessions, and every meta record (settings, team profile, rankings…).
        const dump = await repo.read(async (tx) => {
            const meta: Record<string, unknown> = {};
            for (const key of [META_AI_SETTINGS, META_PERSIST_REQUESTED, META_RANKINGS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, META_TEAM_PROFILE, META_THUMBNAIL_STYLE]) {
                meta[key] = await tx.getMeta(key);
            }
            return { plays: await tx.allPlays(), sessions: await tx.allSessions(), meta };
        });
        expect(dump.sessions.length).toBe(1);
        expect(JSON.stringify(dump)).not.toContain(SENTINEL);
    });
});

describe("browser storage", () => {
    it("never receives the key in localStorage or sessionStorage", () => {
        setKey("openai", SENTINEL);
        const all = [localStorage, sessionStorage].flatMap((storage) => Array.from({ length: storage.length }, (_, i) => `${storage.key(i)}=${storage.getItem(storage.key(i) ?? "")}`));
        expect(all.join("\n")).not.toContain(SENTINEL);
    });
});
