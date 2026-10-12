/**
 * The check-then-write race, step by step (storage connectors spec, Testing),
 * and the same sequence where the write is atomic. At no step does either
 * device replace its working copy without the coach's choice.
 */
import { describe, expect, it } from "vitest";
import { createFakeRemote } from "@/apps/planner/src/storage/fake";
import type { SyncOutcome } from "@/apps/planner/src/storage/sync";
import { readDocumentText } from "@/lib/document-envelope";
import { RANKINGS_FORMAT, type RankingsDocument } from "@/lib/rankings-document";
import { DOCUMENT_ID, KEY, createClock, createDevice, rankingsTitled, wrappedText, writeGate } from "./sync-harness";

function remoteOf(outcome: SyncOutcome) {
    if (!outcome.ok || !outcome.remote) throw new Error(`expected a choice, got ${JSON.stringify(outcome)}`);
    return outcome.remote;
}

function setup(mode: "atomic" | "check-then-write") {
    const clock = createClock();
    const remote = createFakeRemote({ mode, now: () => new Date(clock.now) });
    const file = remote.seed({ name: "fall.rankings.json", text: wrappedText(rankingsTitled("Fall")), kind: RANKINGS_FORMAT, documentId: DOCUMENT_ID });
    const a = createDevice(remote, "Coach A", clock);
    const b = createDevice(remote, "Coach B", clock);
    const remoteTitle = () => {
        const read = readDocumentText(remote.peek(file.fileId)!.text, undefined, { kind: RANKINGS_FORMAT });
        return read.ok ? read.document.payload.meta.title : undefined;
    };
    return { remote, file, a, b, remoteTitle };
}

describe("two devices saving the same file", () => {
    it("check-then-write: B's save lands over A's unseen, and A is told 'Overwritten' instead of refreshing", async () => {
        const { remote, file, a, b, remoteTitle } = setup("check-then-write");

        // A and B open revision 1 and edit.
        await a.engine.openLinked(KEY, file);
        await b.engine.openLinked(KEY, file);
        expect(remote.peek(file.fileId)!.revision).toBe(file.revision);
        a.edit("Fall, A's version");
        b.edit("Fall, B's version");

        const gateA = writeGate();
        const gateB = writeGate();
        a.connector.setBeforeWrite(gateA.hook);
        b.connector.setBeforeWrite(gateB.hook);

        // A's check passes; B's check passes (still revision 1).
        const savingA = a.engine.save(KEY);
        await gateA.reached;
        const savingB = b.engine.save(KEY);
        await gateB.reached;
        // A writes revision 2; then B writes revision 3 over it.
        gateA.release();
        const savedA = await savingA;
        expect(savedA.ok && savedA.state).toBe("in-sync");
        gateB.release();
        const savedB = await savingB;
        // B's save succeeds and B sees nothing wrong: the race isn't prevented on this provider.
        expect(savedB.ok && savedB.state).toBe("in-sync");
        expect(remoteTitle()).toBe("Fall, B's version");
        a.connector.setBeforeWrite(undefined);
        b.connector.setBeforeWrite(undefined);

        // A's next check: "Overwritten", not a refresh. A's version is still in A's working copy.
        const checkA = await a.engine.check(KEY);
        expect(checkA.ok && checkA.state).toBe("overwritten");
        expect(remoteOf(checkA).modifiedBy).toBe("Coach B");
        expect(a.title()).toBe("Fall, A's version");

        // A keeps mine → revision 4 with A's content.
        const keptA = await a.engine.resolve(KEY, "keep-mine", remoteOf(checkA));
        expect(keptA.ok && keptA.state).toBe("in-sync");
        expect(remoteTitle()).toBe("Fall, A's version");

        // B's next check: "Overwritten" in turn; B's content untouched.
        const checkB = await b.engine.check(KEY);
        expect(checkB.ok && checkB.state).toBe("overwritten");
        expect(b.title()).toBe("Fall, B's version");

        // B uses theirs → B holds A's content, and B's version is a recovered copy.
        const theirsB = await b.engine.resolve(KEY, "use-theirs", remoteOf(checkB));
        expect(theirsB.ok && theirsB.state).toBe("in-sync");
        expect(b.title()).toBe("Fall, A's version");
        expect(b.documents.recovered.map((entry) => (entry.copy.payload as RankingsDocument).meta.title)).toEqual(["Fall, B's version"]);
        expect(a.documents.recovered).toEqual([]);

        // Both settled, on A's version.
        const finalA = await a.engine.check(KEY);
        const finalB = await b.engine.check(KEY);
        expect(finalA.ok && finalA.state).toBe("in-sync");
        expect(finalB.ok && finalB.state).toBe("in-sync");
        expect([a.title(), b.title(), remoteTitle()]).toEqual(["Fall, A's version", "Fall, A's version", "Fall, A's version"]);
    });

    it("atomic: B's write is refused as a conflict; B keeps mine, and A is then told 'Overwritten'", async () => {
        const { file, a, b, remoteTitle } = setup("atomic");

        await a.engine.openLinked(KEY, file);
        await b.engine.openLinked(KEY, file);
        a.edit("Fall, A's version");
        b.edit("Fall, B's version");

        const gateA = writeGate();
        const gateB = writeGate();
        a.connector.setBeforeWrite(gateA.hook);
        b.connector.setBeforeWrite(gateB.hook);

        const savingA = a.engine.save(KEY);
        await gateA.reached;
        const savingB = b.engine.save(KEY);
        await gateB.reached;
        gateA.release();
        const savedA = await savingA;
        expect(savedA.ok && savedA.state).toBe("in-sync");
        gateB.release();
        const savedB = await savingB;
        // The precondition and the write are one step: B's write never lands.
        expect(savedB.ok && savedB.state).toBe("conflict");
        expect(remoteTitle()).toBe("Fall, A's version");
        expect(b.title()).toBe("Fall, B's version");
        a.connector.setBeforeWrite(undefined);
        b.connector.setBeforeWrite(undefined);

        // B keeps mine.
        const keptB = await b.engine.resolve(KEY, "keep-mine", remoteOf(savedB));
        expect(keptB.ok && keptB.state).toBe("in-sync");
        expect(remoteTitle()).toBe("Fall, B's version");

        // A, whose save B replaced, is told.
        const checkA = await a.engine.check(KEY);
        expect(checkA.ok && checkA.state).toBe("overwritten");
        expect(a.title()).toBe("Fall, A's version");
        expect(a.documents.recovered).toEqual([]);
        expect(b.documents.recovered).toEqual([]);
    });
});
