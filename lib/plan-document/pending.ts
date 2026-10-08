/**
 * Carries a fragment handoff across login (ADR-0020): a `#plan=` plan link,
 * and a `#src=` league page for "Fetch it for me" (ADR-0024). The dashboard's
 * auth redirect to /login keeps the fragment (a 307 Location without a
 * fragment inherits it, RFC 7231 §7.1.2) but not the path, so the login page
 * stashes the value here and sends the user to the right page after sign-in.
 *
 * Browser-only: every function touches `window`, none at module load.
 */

export const PENDING_PLAN_KEY = "openleague.pendingPlan";
export const PLAN_IMPORT_PATH = "/practice-planner/import";
export const PENDING_LEAGUE_SOURCE_KEY = "openleague.pendingLeagueSource";
/** The hosted "Fetch it for me" page; the static app links here with `#src=<league page URL>`. */
export const LEAGUE_FETCH_PATH = "/practice-planner/fetch-schedule";
/** A stash older than this is ignored, so an abandoned plan can't hijack a later login. */
export const PENDING_PLAN_TTL_MS = 30 * 60_000;
/** A league page address longer than this is never stashed or used. */
export const MAX_LEAGUE_SOURCE_LENGTH = 2_048;
/** Tolerated clock skew for a savedAt slightly in the future. */
const FUTURE_SKEW_MS = 60_000;

function fragmentParam(hash: string, name: string): string | null {
    const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get(name);
    return value ? value : null;
}

/** The `plan` value of a `#plan=…` fragment (or of `plan=…`), or null. */
export function planFragmentValue(hash: string): string | null {
    return fragmentParam(hash, "plan");
}

/** The `src` value of a `#src=…` fragment, or null (also when it is too long to be a page address). */
export function leagueSourceFragmentValue(hash: string): string | null {
    const value = fragmentParam(hash, "src");
    return value && value.length <= MAX_LEAGUE_SOURCE_LENGTH ? value : null;
}

/** Drops the fragment from the address bar and this history entry. Keeps history.state. */
export function clearLocationHash(): void {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
}

function storage(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

/** One fragment value carried across login under its own sessionStorage key. */
function fragmentCarrier(key: string, valueOf: (hash: string) => string | null) {
    const read = (now: number): string | null => {
        let stored: string | null;
        try {
            stored = storage()?.getItem(key) ?? null;
        } catch {
            return null;
        }
        if (!stored) return null;
        try {
            const parsed = JSON.parse(stored) as { value?: unknown; savedAt?: unknown };
            if (typeof parsed.value !== "string" || !parsed.value || typeof parsed.savedAt !== "number") return null;
            const age = now - parsed.savedAt;
            return age <= PENDING_PLAN_TTL_MS && age >= -FUTURE_SKEW_MS ? parsed.value : null;
        } catch {
            return null;
        }
    };
    const take = (now: number): string | null => {
        const value = read(now);
        try {
            storage()?.removeItem(key);
        } catch {
            // Storage unavailable: nothing to remove.
        }
        return value;
    };
    return {
        stash(now: number): boolean {
            const value = valueOf(window.location.hash);
            if (!value) return false;
            let stored = false;
            try {
                storage()?.setItem(key, JSON.stringify({ value, savedAt: now }));
                stored = storage() !== null;
            } catch {
                stored = false;
            }
            // Clear the hash either way: the value must not linger in the URL or history.
            clearLocationHash();
            return stored;
        },
        clear(): void {
            try {
                storage()?.removeItem(key);
            } catch {
                // Storage unavailable: nothing to remove.
            }
        },
        has: (now: number) => read(now) !== null,
        take,
        takeIncoming(now: number): string | null {
            const fromHash = valueOf(window.location.hash);
            if (fromHash) clearLocationHash();
            const stashed = take(now);
            return fromHash ?? stashed;
        },
    };
}

const plan = fragmentCarrier(PENDING_PLAN_KEY, planFragmentValue);
const leagueSource = fragmentCarrier(PENDING_LEAGUE_SOURCE_KEY, leagueSourceFragmentValue);

/** Login page: moves a `#plan=` fragment into sessionStorage. Returns whether it was stored. */
export function stashPlanFragment(now: number = Date.now()): boolean {
    const stored = plan.stash(now);
    // One hand-off at a time: a newer plan link replaces an older league page.
    if (stored) leagueSource.clear();
    return stored;
}

export function hasPendingPlan(now: number = Date.now()): boolean {
    return plan.has(now);
}

/** Returns a fresh stashed value and always removes the stash. */
export function takePendingPlan(now: number = Date.now()): string | null {
    return plan.take(now);
}

/** Import page: the fragment's plan (clearing the hash), else the stashed one. Clears both. */
export function takeIncomingPlan(now: number = Date.now()): string | null {
    return plan.takeIncoming(now);
}

/** Login page: moves a `#src=` fragment into sessionStorage. Returns whether it was stored. */
export function stashLeagueSourceFragment(now: number = Date.now()): boolean {
    const stored = leagueSource.stash(now);
    // One hand-off at a time: a newer league page replaces an older plan link.
    if (stored) plan.clear();
    return stored;
}

export function hasPendingLeagueSource(now: number = Date.now()): boolean {
    return leagueSource.has(now);
}

/** Fetch page: the fragment's league page address (clearing the hash), else the stashed one. Clears both. */
export function takeIncomingLeagueSource(now: number = Date.now()): string | null {
    return leagueSource.takeIncoming(now);
}
