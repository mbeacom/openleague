/** Drill video links in the static store (practice video links spec R6): they ride inside playData, with no DB_VERSION change. */
import { describe, expect, it } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { LocalSessionDrill, LocalSessionSave } from "@/apps/planner/src/store/types";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import type { ActionResult } from "@/lib/planner-store";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { drillRows, type DrillRowInput } from "@/lib/utils/session-rows";
import type { PlayData } from "@/types/practice-planner";

const T = LOCAL_TEAM_ID;
const YT = "Ab3dE5fG7hJ";

function data<R>(result: ActionResult<R>): R {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

const drill = (playId: string, clientKey: string, sequence: number): DrillRowInput => ({ playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "" });
const save = (plays: LocalSessionDrill[]): LocalSessionSave => ({ title: "Riverside Tuesday", date: new Date("2026-10-06T19:00:00"), duration: 60, plays });

const STORED = [{ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" as const, startSec: 90, title: "Breakout demo" }];
const FILMED: PlayData = { ...createEmptyPlayData(), videos: [{ url: `https://youtu.be/${YT}?si=abc&t=90`, provider: "link", title: "Breakout demo" }] };

describe.each(REPOS)("drill video links in the static store (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    it("stores a drill's links normalized and keeps them through a session copy, a duplicate, an export and an import", async () => {
        const { store } = await setup();
        const lib = data(await store.createPlay({ name: "Riverside Breakout", playData: FILMED, isTemplate: true, teamId: T })).id;
        expect(data(await store.getPlayById({ id: lib, teamId: T })).playData.videos).toEqual(STORED);

        const id = data(await store.createSession(save([drill(lib, "k1", 0)]))).id;
        const view = data(await store.getSessionView(id));
        expect(drillRows(view.plays)[0].play.playData?.videos).toEqual(STORED);

        const copy = data(await store.duplicatePracticeSession({ id, teamId: T, date: new Date("2026-10-13T19:00:00") })).id;
        expect(drillRows(data(await store.getSessionView(copy)).plays)[0].play.playData?.videos).toEqual(STORED);

        const plan = buildPlanDocument(view, new Date("2026-10-07T12:00:00Z"), "openleague-static");
        const imported = data(await store.importPlan(plan, { date: new Date("2026-10-20T19:00:00"), addToLibrary: false })).sessionId;
        expect(drillRows(data(await store.getSessionView(imported)).plays)[0].play.playData?.videos).toEqual(STORED);
    });

    it("refuses an invalid link with the field's message", async () => {
        const { store } = await setup();
        const result = await store.createPlay({
            name: "Riverside Breakout",
            playData: { ...createEmptyPlayData(), videos: [{ url: "http://example.org/clip", provider: "link" }] },
            isTemplate: true,
            teamId: T,
        });
        expect(result).toMatchObject({ success: false, error: "Video link: Use an https link" });
    });
});
