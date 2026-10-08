import { describe, expect, it } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { LocalSessionSave } from "@/apps/planner/src/store/types";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import type { DrillRowInput } from "@/lib/utils/session-rows";

const drill = (playId: string, clientKey: string, sequence: number): DrillRowInput => ({
    playId,
    clientKey,
    sequence,
    runsWithPrevious: false,
    duration: 10,
    instructions: "",
});

const save = (plays: DrillRowInput[]): LocalSessionSave => ({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays });

describe.each(REPOS)("countPlayUsage (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return createLocalPlannerStore(h.repo, h.options);
    }

    it("counts the practices holding a copy of the drill, once each", async () => {
        const store = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const other = await addLibraryPlay(store, "Rush");
        expect(await store.countPlayUsage(lib)).toEqual({ success: true, data: 0 });

        await store.createSession(save([drill(lib, "k1", 0), drill(lib, "k2", 1)]));
        const second = await store.createSession(save([drill(lib, "k1", 0)]));
        await store.createSession(save([drill(other, "k1", 0)]));
        expect(await store.countPlayUsage(lib)).toEqual({ success: true, data: 2 });

        if (!second.success) throw new Error(second.error);
        await store.deletePracticeSession({ id: second.data.id, teamId: LOCAL_TEAM_ID });
        expect(await store.countPlayUsage(lib)).toEqual({ success: true, data: 1 });
    });
});
