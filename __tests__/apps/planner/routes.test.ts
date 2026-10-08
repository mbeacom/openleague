import { describe, expect, it } from "vitest";
import { matchRoute, navSection, staticRoutes, type StaticRoute } from "@/apps/planner/src/routes";

describe("matchRoute", () => {
    it.each<[string, StaticRoute]>([
        ["", { name: "list" }],
        ["#", { name: "list" }],
        ["#/", { name: "list" }],
        ["#/sessions/new", { name: "sessionNew" }],
        ["#/sessions/abc", { name: "session", id: "abc" }],
        ["#/sessions/abc/edit", { name: "sessionEdit", id: "abc" }],
        ["#/sessions/abc/print", { name: "sessionPrint", id: "abc" }],
        ["#/sessions/a%20b", { name: "session", id: "a b" }],
        ["#/library", { name: "library" }],
        ["#/library/", { name: "library" }],
        ["#/library/new", { name: "libraryNew" }],
        ["#/library/p1/edit", { name: "libraryEdit", id: "p1" }],
        ["#/import", { name: "import" }],
        ["#plan=abc_-1", { name: "planLink", value: "abc_-1" }],
        ["#/plan=abc", { name: "planLink", value: "abc" }],
        ["#plan=", { name: "notFound" }],
        ["#/sessions/a%2Fb", { name: "notFound" }],
        ["#/sessions/%E0%A4%A", { name: "notFound" }],
        ["#/sessions/abc/delete", { name: "notFound" }],
        ["#/library/p1", { name: "libraryPlay", id: "p1" }],
        ["#/library/p1/", { name: "libraryPlay", id: "p1" }],
        ["#/library/p%201", { name: "libraryPlay", id: "p 1" }],
        ["#/library/p1/practice", { name: "sessionNewWithDrill", drillId: "p1" }],
        ["#/library/p1/delete", { name: "notFound" }],
        ["#/library/p1/edit/x", { name: "notFound" }],
        ["#/library/a%2Fb", { name: "notFound" }],
        ["#/sessions/new/edit", { name: "notFound" }],
        ["#/sessions/new/print", { name: "notFound" }],
        ["#/library/new/edit", { name: "notFound" }],
        ["#/rankings", { name: "rankings" }],
        ["#/rankings/", { name: "rankings" }],
        ["#/rankings/import", { name: "rankingsImport" }],
        ["#/rankings/import/update", { name: "rankingsImport", update: true }],
        ["#/rankings/import/other", { name: "notFound" }],
        ["#/rankings/setup", { name: "rankingsSetup" }],
        ["#/rankings/what-if", { name: "rankingsWhatIf" }],
        ["#/rankings/team/903", { name: "rankingsTeam", number: "903" }],
        ["#/rankings/team", { name: "notFound" }],
        ["#/rankings/team/903/x", { name: "notFound" }],
        ["#/rankings/nope", { name: "notFound" }],
        ["#/nope", { name: "notFound" }],
        ["#/ai", { name: "aiSettings" }],
        ["#/ai/", { name: "aiSettings" }],
        ["#/ai/x", { name: "notFound" }],
        ["#/import/notes", { name: "importNotes" }],
        ["#/import/notes/x", { name: "notFound" }],
        ["#/import/other", { name: "notFound" }],
    ])("%s", (hash, expected) => {
        expect(matchRoute(hash)).toEqual(expected);
    });

    it("matches every href staticRoutes builds", () => {
        expect(matchRoute(staticRoutes.list())).toEqual({ name: "list" });
        expect(matchRoute(staticRoutes.session("s-1"))).toEqual({ name: "session", id: "s-1" });
        expect(matchRoute(staticRoutes.sessionEdit("s-1"))).toEqual({ name: "sessionEdit", id: "s-1" });
        expect(matchRoute(staticRoutes.sessionPrint("s-1"))).toEqual({ name: "sessionPrint", id: "s-1" });
        expect(matchRoute(staticRoutes.libraryNew())).toEqual({ name: "libraryNew" });
        expect(matchRoute(staticRoutes.libraryEdit("p-1"))).toEqual({ name: "libraryEdit", id: "p-1" });
        expect(matchRoute(staticRoutes.library())).toEqual({ name: "library" });
        expect(matchRoute(staticRoutes.sessionNew())).toEqual({ name: "sessionNew" });
        expect(matchRoute(staticRoutes.importPlan())).toEqual({ name: "import" });
        expect(matchRoute(staticRoutes.aiSettings())).toEqual({ name: "aiSettings" });
        expect(matchRoute(staticRoutes.importNotes())).toEqual({ name: "importNotes" });
    });

    it("builds and matches the drill details and start-a-practice routes", () => {
        expect(staticRoutes.libraryPlay("p-1")).toBe("#/library/p-1");
        expect(matchRoute(staticRoutes.libraryPlay("p-1"))).toEqual({ name: "libraryPlay", id: "p-1" });
        expect(matchRoute(staticRoutes.sessionNewWithDrill("p-1"))).toEqual({ name: "sessionNewWithDrill", drillId: "p-1" });
        // "new" stays the create route, never a drill id.
        expect(matchRoute(staticRoutes.libraryNew())).toEqual({ name: "libraryNew" });
    });

    it("puts drill details under Library and a practice started from a drill under Practices", () => {
        expect(navSection({ name: "libraryPlay", id: "p1" })).toBe("library");
        expect(navSection({ name: "sessionNewWithDrill", drillId: "p1" })).toBe("practices");
    });

    it("puts the notes draft under Import and AI settings under no section", () => {
        expect(navSection({ name: "importNotes" })).toBe("import");
        expect(navSection({ name: "aiSettings" })).toBeNull();
    });
});

describe("rankings routes", () => {
    it("builds and matches the team route", () => {
        expect(staticRoutes.rankingsTeam("903")).toBe("#/rankings/team/903");
        expect(matchRoute(staticRoutes.rankingsTeam("903"))).toEqual({ name: "rankingsTeam", number: "903" });
    });

    it("builds and matches the update-results route, which is the import screen", () => {
        expect(matchRoute(staticRoutes.rankingsUpdate())).toEqual({ name: "rankingsImport", update: true });
        expect(navSection(matchRoute(staticRoutes.rankingsUpdate()))).toBe("rankings");
    });
});
