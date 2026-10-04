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
    sessionNew: () => "#/sessions/new",
    importPlan: () => "#/import",
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
    | { name: "import" }
    | { name: "planLink"; value: string }
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

/** Pure: location.hash in, route out. A hash holding `plan=` is a plan link (the hosted Export menu's). */
export function matchRoute(hash: string): StaticRoute {
    const body = (hash.startsWith("#") ? hash.slice(1) : hash).replace(/^\/+/, "");
    const plan = planFragmentValue(body);
    if (plan) return { name: "planLink", value: plan };

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
        return id && third === "edit" ? { name: "libraryEdit", id } : NOT_FOUND;
    }
    if (section === "import" && second === undefined) return { name: "import" };
    return NOT_FOUND;
}

/** The app bar's sections. */
export type NavSection = "practices" | "library" | "import";

/** Which app bar section a route belongs to, for aria-current; null when none does. */
export function navSection(route: StaticRoute): NavSection | null {
    switch (route.name) {
        case "list":
        case "sessionNew":
        case "session":
        case "sessionEdit":
        case "sessionPrint":
            return "practices";
        case "library":
        case "libraryNew":
        case "libraryEdit":
            return "library";
        case "import":
        case "planLink":
            return "import";
        case "notFound":
            return null;
    }
}
