import { describe, expect, it } from "vitest";
import { createFileHandleStore } from "@/apps/planner/src/store/file-handles";
import { META_FILE_HANDLES } from "@/apps/planner/src/store/records";
import { REPOS } from "../store-harness";

describe.each(REPOS)("file handle store (%s)", (_name, open) => {
    it("keeps handles by file id, deletes one, and sweeps those no link uses", async () => {
        const repo = await open();
        const handles = createFileHandleStore(repo, () => new Date("2026-10-11T12:00:00.000Z"));
        // Plain data stands in for a FileSystemFileHandle (both are structured-cloneable).
        await handles.put("a", { name: "a.olplan.json" });
        await handles.put("b", { name: "b.rankings.json" });
        await handles.put("c", { name: "c.olplan.json" });
        expect(await handles.get("a")).toEqual({ name: "a.olplan.json" });
        await handles.delete("b");
        expect(await handles.get("b")).toBeUndefined();
        expect(await handles.sweep(new Set(["a"]))).toBe(1);
        expect(await handles.get("c")).toBeUndefined();
        expect(await handles.get("a")).toEqual({ name: "a.olplan.json" });
    });

    it("reads a damaged record as no handles", async () => {
        const repo = await open();
        await repo.write((tx) => tx.putMeta(META_FILE_HANDLES, ["not", "a", "map"]));
        const handles = createFileHandleStore(repo);
        expect(await handles.get("a")).toBeUndefined();
        expect(await handles.sweep(new Set())).toBe(0);
    });
});
