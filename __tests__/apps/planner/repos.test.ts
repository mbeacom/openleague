import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { DB_VERSION, OPEN_TIMEOUT_MS, StorageBlockedError, openIdbRepo, upgradeDatabase } from "@/apps/planner/src/store/idb-repo";
import type { PlannerRepo, StoredPlay, StoredSession } from "@/apps/planner/src/store/records";

let dbSeq = 0;
const AT = new Date("2026-10-03T12:00:00.000Z");

function play(id: string, sessionId: string | null = null): StoredPlay {
    return { id, name: `Drill ${id}`, description: null, thumbnail: null, playData: { version: 2 }, isTemplate: sessionId === null, sessionId, sourcePlayId: null, createdAt: AT, updatedAt: AT };
}

function session(id: string): StoredSession {
    return { id, title: "Tuesday", date: AT, duration: 60, rows: [], createdAt: AT, updatedAt: AT };
}

const REPOS: Array<[string, () => Promise<PlannerRepo>]> = [
    ["memory", async () => createMemoryRepo()],
    ["indexeddb", () => openIdbRepo({ factory: new IDBFactory(), name: `repo-test-${++dbSeq}` })],
];

describe.each(REPOS)("%s repo", (_name, open) => {
    it("stores and returns copies, never live objects", async () => {
        const repo = await open();
        await repo.write((tx) => tx.putPlay(play("p1")));
        const first = await repo.read((tx) => tx.getPlay("p1"));
        first!.name = "changed";
        expect((await repo.read((tx) => tx.getPlay("p1")))?.name).toBe("Drill p1");
        expect((await repo.read((tx) => tx.getPlay("p1")))?.createdAt).toEqual(AT);
    });

    it("lists a session's owned copies by session", async () => {
        const repo = await open();
        await repo.write(async (tx) => {
            await tx.putPlay(play("lib"));
            await tx.putPlay(play("a", "s1"));
            await tx.putPlay(play("b", "s2"));
        });
        const owned = await repo.read((tx) => tx.sessionPlays("s1"));
        expect(owned.map((p) => p.id)).toEqual(["a"]);
        expect((await repo.read((tx) => tx.allPlays())).map((p) => p.id).sort()).toEqual(["a", "b", "lib"]);
    });

    it("stores sessions and meta", async () => {
        const repo = await open();
        await repo.write(async (tx) => {
            await tx.putSession(session("s1"));
            await tx.putMeta("startersSeeded", true);
        });
        expect((await repo.read((tx) => tx.getSession("s1")))?.title).toBe("Tuesday");
        expect(await repo.read((tx) => tx.getMeta("startersSeeded"))).toBe(true);
        expect(await repo.read((tx) => tx.getMeta("missing"))).toBeUndefined();
        await repo.write((tx) => tx.deleteSession("s1"));
        expect(await repo.read((tx) => tx.allSessions())).toEqual([]);
    });

    it("rolls back every write of a work that throws", async () => {
        const repo = await open();
        await expect(
            repo.write(async (tx) => {
                await tx.putPlay(play("p1"));
                throw new Error("refused");
            }),
        ).rejects.toThrow("refused");
        expect(await repo.read((tx) => tx.getPlay("p1"))).toBeUndefined();
    });

    it("refuses writes in a read", async () => {
        const repo = await open();
        await expect(repo.read((tx) => tx.putPlay(play("p1")))).rejects.toBeDefined();
        expect(await repo.read((tx) => tx.getPlay("p1"))).toBeUndefined();
    });

    it("applies concurrent writes one after another", async () => {
        const repo = await open();
        await Promise.all([repo.write((tx) => tx.putPlay(play("a"))), repo.write((tx) => tx.putPlay(play("b")))]);
        expect((await repo.read((tx) => tx.allPlays())).length).toBe(2);
    });
});

describe("memory repo", () => {
    it("is not durable", () => {
        expect(createMemoryRepo().durable).toBe(false);
    });
});

describe("IndexedDB repo", () => {
    it("is durable and keeps data across a close and reopen", async () => {
        const factory = new IDBFactory();
        const first = await openIdbRepo({ factory, name: "reopen" });
        expect(first.durable).toBe(true);
        await first.write((tx) => tx.putPlay(play("p1")));
        first.close();
        const second = await openIdbRepo({ factory, name: "reopen" });
        expect((await second.read((tx) => tx.getPlay("p1")))?.name).toBe("Drill p1");
    });

    it("rejects a write that awaits a timer before touching the store, and stores nothing", async () => {
        const repo = await openIdbRepo({ factory: new IDBFactory(), name: "early-commit" });
        await expect(
            repo.write(async (tx) => {
                // 20 ms, not 0: fake-indexeddb auto-commits on a setImmediate tick, and setTimeout(0) can race it.
                await new Promise((resolve) => setTimeout(resolve, 20));
                await tx.putPlay(play("late"));
            }),
        ).rejects.toBeDefined();
        expect(await repo.read((tx) => tx.getPlay("late"))).toBeUndefined();
    });

    it("rejects, rather than hangs, when a request fails and aborts the transaction", async () => {
        const repo = await openIdbRepo({ factory: new IDBFactory(), name: "request-error" });
        // An uncloneable value fails the put with DataCloneError.
        const bad = { ...play("bad"), playData: () => undefined } as unknown as StoredPlay;
        await expect(repo.write((tx) => tx.putPlay(bad))).rejects.toBeDefined();
        expect(await repo.read((tx) => tx.getPlay("bad"))).toBeUndefined();
    });

    it("tells the app when a newer tab upgrades the database", async () => {
        const factory = new IDBFactory();
        let notified = false;
        await openIdbRepo({ factory, name: "upgrade", onVersionChange: () => (notified = true) });
        await new Promise<void>((resolve, reject) => {
            const request = factory.open("upgrade", DB_VERSION + 1);
            request.onsuccess = () => {
                request.result.close();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
        expect(notified).toBe(true);
    });

    it("tells the app when the browser closes the connection", async () => {
        const { factory, request } = stalledFactory();
        let notified = false;
        const opening = openIdbRepo({ factory, name: "closed", onVersionChange: () => (notified = true) });
        const db = fakeDb();
        settle(request, db);
        await opening;
        db.onclose?.(new Event("close"));
        expect(notified).toBe(true);
    });
});

describe("IndexedDB schema versions (practice timing rows, practice staff)", () => {
    // A session as a planner built before practice timing stored it: drill rows only, no kind.
    const v1Session: StoredSession = {
        ...session("s1"),
        rows: [{ id: "r1", playId: "p1", sequence: 0, duration: 10, instructions: "Skate", runsWithPrevious: false }],
    };

    /** Opens the database at `version` exactly as a build of that version did, and leaves the connection open. */
    function openAt(factory: IDBFactory, name: string, version: number): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = factory.open(name, version);
            request.onupgradeneeded = (event) => upgradeDatabase(request.result, event.oldVersion);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function seed(db: IDBDatabase): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(["plays", "sessions", "meta"], "readwrite");
            tx.objectStore("plays").put(play("p1", "s1"));
            tx.objectStore("plays").put(play("lib"));
            tx.objectStore("sessions").put(v1Session);
            tx.objectStore("meta").put({ key: "starter-drills", value: true });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function versionOf(factory: IDBFactory, name: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const request = factory.open(name);
            request.onsuccess = () => {
                const { version } = request.result;
                request.result.close();
                resolve(version);
            };
            request.onerror = () => reject(request.error);
        });
    }

    it("is version 5", () => expect(DB_VERSION).toBe(5));

    it("opens a version 1 database at the current version with every store, index and record intact", async () => {
        const factory = new IDBFactory();
        const v1 = await openAt(factory, "v1-upgrade", 1);
        await seed(v1);
        v1.close();

        const repo = await openIdbRepo({ factory, name: "v1-upgrade" });
        const contents = await repo.read(async (tx) => ({
            plays: await tx.allPlays(),
            owned: await tx.sessionPlays("s1"),
            sessions: await tx.allSessions(),
            meta: await tx.getMeta("starter-drills"),
        }));
        repo.close();

        expect(contents.plays.map((p) => p.id).sort()).toEqual(["lib", "p1"]);
        expect(contents.owned.map((p) => p.id)).toEqual(["p1"]);
        expect(contents.sessions).toEqual([v1Session]);
        expect(contents.meta).toBe(true);
        expect(await versionOf(factory, "v1-upgrade")).toBe(DB_VERSION);
    });

    it("makes a tab still open at version 1 close its connection before the upgrade, keeping its data", async () => {
        const factory = new IDBFactory();
        const v1 = await openAt(factory, "v1-open-tab", 1);
        await seed(v1);
        // What a pre-timing build's openIdbRepo installs: close, then tell the app to reload.
        const reload = vi.fn();
        v1.onversionchange = () => {
            v1.close();
            reload();
        };

        const repo = await openIdbRepo({ factory, name: "v1-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        repo.close();
    });

    it("reports storage blocked when a version 1 connection won't close, so this tab asks for a reload", async () => {
        const factory = new IDBFactory();
        const v1 = await openAt(factory, "v1-holds-on", 1);
        await expect(openIdbRepo({ factory, name: "v1-holds-on" })).rejects.toBeInstanceOf(StorageBlockedError);
        v1.close();
    });

    it("makes a tab still open at version 2 (before practice staff) reload before this build writes, keeping its data", async () => {
        const factory = new IDBFactory();
        const v2 = await openAt(factory, "v2-open-tab", 2);
        await seed(v2);
        // A pre-staff build would rewrite a session without its staff: its tab must reload first.
        const reload = vi.fn();
        v2.onversionchange = () => {
            v2.close();
            reload();
        };
        const repo = await openIdbRepo({ factory, name: "v2-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        expect(await versionOf(factory, "v2-open-tab")).toBe(DB_VERSION);
        repo.close();
    });

    it("makes a tab still open at version 3 (before age groups) reload before this build writes, keeping its data", async () => {
        const factory = new IDBFactory();
        const v3 = await openAt(factory, "v3-open-tab", 3);
        await seed(v3);
        // A build without age groups would rewrite a drill without them: its tab must reload first.
        const reload = vi.fn();
        v3.onversionchange = () => {
            v3.close();
            reload();
        };
        const repo = await openIdbRepo({ factory, name: "v3-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        expect((await repo.read((tx) => tx.allPlays())).map((p) => p.id).sort()).toEqual(["lib", "p1"]);
        expect(await versionOf(factory, "v3-open-tab")).toBe(DB_VERSION);
        repo.close();
    });

    it("makes a tab still open at version 4 (before practice equipment) reload before this build writes, keeping its data", async () => {
        const factory = new IDBFactory();
        const v4 = await openAt(factory, "v4-open-tab", 4);
        await seed(v4);
        // A build without equipment would save a drill without its changes: its tab must reload first.
        const reload = vi.fn();
        v4.onversionchange = () => {
            v4.close();
            reload();
        };
        const repo = await openIdbRepo({ factory, name: "v4-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        expect(await versionOf(factory, "v4-open-tab")).toBe(5);
        repo.close();
    });
});

/** An IDBFactory whose open request only settles when the test says so. */
function stalledFactory() {
    const request = {} as IDBOpenDBRequest;
    const factory = { open: () => request } as unknown as IDBFactory;
    return { factory, request };
}

function fakeDb() {
    return { close: vi.fn(), onclose: null, onversionchange: null } as unknown as IDBDatabase & { close: ReturnType<typeof vi.fn> };
}

function settle(request: IDBOpenDBRequest, db: IDBDatabase) {
    Object.defineProperty(request, "result", { value: db });
    request.onsuccess?.(new Event("success"));
}

describe("IndexedDB open timeout", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects when the open request never settles", async () => {
        vi.useFakeTimers();
        const { factory } = stalledFactory();
        const opening = openIdbRepo({ factory, name: "stalled" });
        const outcome = expect(opening).rejects.toThrow(/didn't open/);
        await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
        await outcome;
    });

    it("closes a connection that opens after the timeout", async () => {
        vi.useFakeTimers();
        const { factory, request } = stalledFactory();
        const opening = openIdbRepo({ factory, name: "late" });
        const outcome = expect(opening).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
        await outcome;
        const db = fakeDb();
        settle(request, db);
        expect(db.close).toHaveBeenCalledTimes(1);
    });

    it("opens normally before the timeout", async () => {
        vi.useFakeTimers();
        const { factory, request } = stalledFactory();
        const opening = openIdbRepo({ factory, name: "quick" });
        const db = fakeDb();
        settle(request, db);
        await expect(opening).resolves.toMatchObject({ durable: true });
        await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
        expect(db.close).not.toHaveBeenCalled();
    });
});
