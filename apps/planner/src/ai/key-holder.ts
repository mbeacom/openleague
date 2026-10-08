/**
 * The coach's keys, in memory only (ADR-0023, spec R5): a module variable for
 * the life of the tab. Never written to IndexedDB, localStorage,
 * sessionStorage, a URL or a log; a reload forgets them. Also counts this
 * tab's requests, for the warning after 20 (spec R5).
 */
import type { ProviderKind } from "@/lib/ai/types";

const keys = new Map<ProviderKind, string>();
const listeners = new Set<() => void>();
let version = 0;
let requests = 0;

/** The count after which the preview warns. */
export const REQUEST_WARNING_THRESHOLD = 20;

function changed(): void {
    version += 1;
    for (const listener of [...listeners]) listener();
}

export function setKey(kind: ProviderKind, key: string): void {
    const trimmed = key.trim();
    if (trimmed) keys.set(kind, trimmed);
    else keys.delete(kind);
    changed();
}

export function getKey(kind: ProviderKind): string {
    return keys.get(kind) ?? "";
}

export function hasKey(kind: ProviderKind): boolean {
    return keys.has(kind);
}

export function forgetKey(kind: ProviderKind): void {
    keys.delete(kind);
    changed();
}

export function forgetAllKeys(): void {
    keys.clear();
    changed();
}

export function subscribeKeys(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function keysVersion(): number {
    return version;
}

/** Called once per request sent; returns the new count. */
export function countRequest(): number {
    requests += 1;
    changed();
    return requests;
}

export function requestCount(): number {
    return requests;
}

/** Tests only: a clean slate between tests. */
export function resetKeyHolderForTests(): void {
    keys.clear();
    requests = 0;
    version = 0;
    listeners.clear();
}
