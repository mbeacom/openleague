/**
 * Carries a `#plan=` fragment across login (ADR-0020). The dashboard's auth
 * redirect to /login keeps the fragment (a 307 Location without a fragment
 * inherits it, RFC 7231 §7.1.2) but not the path, so the login page stashes
 * the value here and sends the coach to the import page after sign-in.
 *
 * Browser-only: every function touches `window`, none at module load.
 */

export const PENDING_PLAN_KEY = "openleague.pendingPlan";
export const PLAN_IMPORT_PATH = "/practice-planner/import";
/** A stash older than this is ignored, so an abandoned plan can't hijack a later login. */
export const PENDING_PLAN_TTL_MS = 30 * 60_000;
/** Tolerated clock skew for a savedAt slightly in the future. */
const FUTURE_SKEW_MS = 60_000;

/** The `plan` value of a `#plan=…` fragment (or of `plan=…`), or null. */
export function planFragmentValue(hash: string): string | null {
    const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("plan");
    return value ? value : null;
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

function readPending(now: number): string | null {
    let stored: string | null;
    try {
        stored = storage()?.getItem(PENDING_PLAN_KEY) ?? null;
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
}

/** Login page: moves a `#plan=` fragment into sessionStorage. Returns whether it was stored. */
export function stashPlanFragment(now: number = Date.now()): boolean {
    const value = planFragmentValue(window.location.hash);
    if (!value) return false;
    let stored = false;
    try {
        storage()?.setItem(PENDING_PLAN_KEY, JSON.stringify({ value, savedAt: now }));
        stored = storage() !== null;
    } catch {
        stored = false;
    }
    // Clear the hash either way: a plan must not linger in the URL or history.
    clearLocationHash();
    return stored;
}

export function hasPendingPlan(now: number = Date.now()): boolean {
    return readPending(now) !== null;
}

/** Returns a fresh stashed value and always removes the stash. */
export function takePendingPlan(now: number = Date.now()): string | null {
    const value = readPending(now);
    try {
        storage()?.removeItem(PENDING_PLAN_KEY);
    } catch {
        // Storage unavailable: nothing to remove.
    }
    return value;
}

/** Import page: the fragment's plan (clearing the hash), else the stashed one. Clears both. */
export function takeIncomingPlan(now: number = Date.now()): string | null {
    const fromHash = planFragmentValue(window.location.hash);
    if (fromHash) clearLocationHash();
    const stashed = takePendingPlan(now);
    return fromHash ?? stashed;
}
