/**
 * Hash routes for the static planner. The shapes match createHashPlatform()
 * in __tests__/helpers/planner.tsx, which sub-project 2 pinned.
 */
import type { PlannerRoutes } from "@/lib/planner-store";
import { planFragmentValue } from "@/lib/plan-document/pending";

export interface StaticRoutes extends PlannerRoutes {
    library(): string;
    sessionNew(): string;
    importPlan(): string;
    rankings(): string;
    rankingsImport(): string;
    /** Import, arriving from "Update results": the schedule paste box is focused, with a one-line hint. */
    rankingsUpdate(): string;
    rankingsSetup(): string;
    rankingsWhatIf(): string;
    rankingsTeam(number: string): string;
    /** AI settings (ADR-0023). */
    aiSettings(): string;
    /** Practice notes → a draft plan (ADR-0023). */
    importNotes(): string;
}

const enc = encodeURIComponent;

export const staticRoutes: StaticRoutes = {
    list: () => "#/",
    session: (id) => `#/sessions/${enc(id)}`,
    sessionEdit: (id) => `#/sessions/${enc(id)}/edit`,
    sessionPrint: (id) => `#/sessions/${enc(id)}/print`,
    libraryNew: () => "#/library/new",
    libraryEdit: (playId) => `#/library/${enc(playId)}/edit`,
    library: () => "#/library",
    libraryPlay: (playId) => `#/library/${enc(playId)}`,
    sessionNewWithDrill: (playId) => `#/library/${enc(playId)}/practice`,
    sessionNew: () => "#/sessions/new",
    importPlan: () => "#/import",
    rankings: () => "#/rankings",
    rankingsImport: () => "#/rankings/import",
    rankingsUpdate: () => "#/rankings/import/update",
    rankingsSetup: () => "#/rankings/setup",
    rankingsWhatIf: () => "#/rankings/what-if",
    rankingsTeam: (number) => `#/rankings/team/${enc(number)}`,
    aiSettings: () => "#/ai",
    importNotes: () => "#/import/notes",
};

export type StaticRoute =
    | { name: "list" }
    | { name: "sessionNew" }
    | { name: "session"; id: string }
    | { name: "sessionEdit"; id: string }
    | { name: "sessionPrint"; id: string }
    | { name: "library" }
    | { name: "libraryNew" }
    | { name: "libraryEdit"; id: string }
    | { name: "libraryPlay"; id: string }
    | { name: "sessionNewWithDrill"; drillId: string }
    | { name: "import" }
    | { name: "planLink"; value: string }
    | { name: "rankings" }
    | { name: "rankingsImport"; pull?: string; update?: boolean }
    | { name: "rankingsSetup" }
    | { name: "rankingsWhatIf" }
    | { name: "rankingsTeam"; number: string }
    | { name: "aiSettings" }
    | { name: "importNotes" }
    | { name: "notFound" };

const NOT_FOUND: StaticRoute = { name: "notFound" };

function decodeId(raw: string): string | null {
    try {
        const id = decodeURIComponent(raw);
        return id && !id.includes("/") ? id : null;
    } catch {
        return null;
    }
}

/**
 * `rankings/import?pull=…`: a schedule the hosted "Fetch it for me" page sends
 * (ADR-0024). Only this route takes a query; null for anything else.
 */
function matchPull(body: string): StaticRoute | null {
    const at = body.indexOf("?");
    if (at === -1 || body.slice(0, at).replace(/\/+$/, "") !== "rankings/import") return null;
    const pull = new URLSearchParams(body.slice(at + 1)).get("pull");
    return pull ? { name: "rankingsImport", pull } : { name: "rankingsImport" };
}

/** Pure: location.hash in, route out. A hash holding `plan=` is a plan link (the hosted Export menu's). */
export function matchRoute(hash: string): StaticRoute {
    const body = (hash.startsWith("#") ? hash.slice(1) : hash).replace(/^\/+/, "");
    const plan = planFragmentValue(body);
    if (plan) return { name: "planLink", value: plan };
    const pulled = matchPull(body);
    if (pulled) return pulled;

    const parts = body.replace(/\/+$/, "").split("/");
    if (parts.length === 1 && parts[0] === "") return { name: "list" };
    const [section, second, third, ...rest] = parts;
    if (rest.length > 0) return NOT_FOUND;

    if (section === "sessions") {
        // "new" is the create route, never a session id: /sessions/new/edit is no route.
        if (second === "new") return third === undefined ? { name: "sessionNew" } : NOT_FOUND;
        const id = second === undefined ? null : decodeId(second);
        if (!id) return NOT_FOUND;
        if (third === undefined) return { name: "session", id };
        if (third === "edit") return { name: "sessionEdit", id };
        if (third === "print") return { name: "sessionPrint", id };
        return NOT_FOUND;
    }
    if (section === "library") {
        if (second === undefined) return { name: "library" };
        if (second === "new") return third === undefined ? { name: "libraryNew" } : NOT_FOUND;
        const id = decodeId(second);
        if (!id) return NOT_FOUND;
        if (third === undefined) return { name: "libraryPlay", id };
        if (third === "edit") return { name: "libraryEdit", id };
        if (third === "practice") return { name: "sessionNewWithDrill", drillId: id };
        return NOT_FOUND;
    }
    if (section === "import" && second === undefined) return { name: "import" };
    if (section === "import" && second === "notes" && third === undefined) return { name: "importNotes" };
    if (section === "ai" && second === undefined) return { name: "aiSettings" };
    if (section === "rankings") {
        if (second === undefined) return { name: "rankings" };
        if (third === undefined) {
            if (second === "import") return { name: "rankingsImport" };
            if (second === "setup") return { name: "rankingsSetup" };
            if (second === "what-if") return { name: "rankingsWhatIf" };
            return NOT_FOUND;
        }
        if (second === "import" && third === "update") return { name: "rankingsImport", update: true };
        if (second === "team") {
            const number = decodeId(third);
            return number ? { name: "rankingsTeam", number } : NOT_FOUND;
        }
        return NOT_FOUND;
    }
    return NOT_FOUND;
}

/** The app bar's sections. */
export type NavSection = "practices" | "library" | "import" | "rankings";

/** Which app bar section a route belongs to, for aria-current; null when none does. */
export function navSection(route: StaticRoute): NavSection | null {
    switch (route.name) {
        case "list":
        case "sessionNew":
        case "session":
        case "sessionEdit":
        case "sessionPrint":
        case "sessionNewWithDrill":
            return "practices";
        case "library":
        case "libraryNew":
        case "libraryEdit":
        case "libraryPlay":
            return "library";
        case "import":
        case "planLink":
        case "importNotes":
            return "import";
        case "rankings":
        case "rankingsImport":
        case "rankingsSetup":
        case "rankingsWhatIf":
        case "rankingsTeam":
            return "rankings";
        case "aiSettings":
        case "notFound":
            return null;
    }
}
