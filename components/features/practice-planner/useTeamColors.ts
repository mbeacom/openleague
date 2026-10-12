"use client";

/**
 * The "Team colors" display option's remembered choice: one value per device
 * under TEAM_COLORS_STORAGE_KEY, shared by the session page, the bench sheet
 * and the bench sheet downloads. Off unless the coach turned it on.
 *
 * Read through useSyncExternalStore with off as the server snapshot, so the
 * hosted page hydrates without a mismatch. Every storage access is guarded:
 * when the browser blocks storage (or a write fails), the choice lives in this
 * page only and the option keeps working. (The age filter's pattern.)
 */
import { useMemo, useSyncExternalStore } from "react";
import { teamRoleColors, type RoleColors } from "@/lib/utils/team-palette";
import type { TeamMark } from "@/types/practice-planner";

/** The one localStorage key that remembers the option on this device. */
export const TEAM_COLORS_STORAGE_KEY = "openleague.planner.teamColors";
const ON = "on";

const listeners = new Set<() => void>();
/** Set once storage fails; from then on the choice lives here, for this page only. */
let memory: { value: boolean } | null = null;

function read(): boolean {
    if (memory) return memory.value;
    try {
        return window.localStorage.getItem(TEAM_COLORS_STORAGE_KEY) === ON;
    } catch {
        memory = { value: false };
        return false;
    }
}

/** Remembers the choice and tells every view on the page. */
export function setTeamColors(value: boolean): void {
    if (memory) {
        memory.value = value;
    } else {
        try {
            if (value) window.localStorage.setItem(TEAM_COLORS_STORAGE_KEY, ON);
            else window.localStorage.removeItem(TEAM_COLORS_STORAGE_KEY);
        } catch {
            memory = { value };
        }
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // A change made in another tab of this site.
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === TEAM_COLORS_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

const off = () => false;

/** [whether diagrams draw in team colors; the setter] */
export function useTeamColors(): [boolean, (value: boolean) => void] {
    return [useSyncExternalStore(subscribe, read, off), setTeamColors];
}

const NO_COLORS: RoleColors = {};

/**
 * The option for one team: `available` when the team has a color a marker can
 * wear (else there is nothing to offer), and the colors to remap with, empty
 * while the option is off. Memoized, so a remapped session stays stable.
 */
export function useTeamRoleColors(mark: Pick<TeamMark, "color" | "secondaryColor"> | null | undefined): {
    available: boolean;
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    roleColors: RoleColors;
} {
    const [enabled, setEnabled] = useTeamColors();
    const primary = mark?.color ?? null;
    const secondary = mark?.secondaryColor ?? null;
    const colors = useMemo(() => teamRoleColors({ color: primary, secondaryColor: secondary }), [primary, secondary]);
    const available = Object.keys(colors).length > 0;
    return { available, enabled, setEnabled, roleColors: enabled && available ? colors : NO_COLORS };
}
