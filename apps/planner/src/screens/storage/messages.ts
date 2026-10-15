/** What the storage screens say (storage connectors spec, Sync and conflicts). */
import type { ConnectorError, ConnectorId } from "../../storage/connector";
import type { SyncError, SyncState } from "../../storage/sync";

export interface ConnectorLabels {
    /** "Save to…" and "Open from…" items. */
    item: string;
    /** In sentences: "Saved to fall.rankings.json on this computer". */
    where: string;
}

export const CONNECTOR_LABELS: Record<ConnectorId, ConnectorLabels> = {
    "local-file": { item: "File on this computer…", where: "on this computer" },
    "google-drive": { item: "Google Drive…", where: "in Google Drive" },
    onedrive: { item: "OneDrive…", where: "in OneDrive" },
};

/** The storage itself, in sentences ("Google Drive didn't allow access"). */
export const CONNECTOR_NAMES: Record<ConnectorId, string> = {
    "local-file": "This computer",
    "google-drive": "Google Drive",
    onedrive: "OneDrive",
};

/** A cloud sign-in that didn't finish, in words; null when the coach closed it. */
export function connectErrorText(error: ConnectorError, connector: ConnectorId): string | null {
    const name = CONNECTOR_NAMES[connector];
    switch (error.code) {
        case "cancelled":
            return null;
        case "auth-required":
            return `${name} didn't allow access. Try again, and allow OpenLeague to use the files it creates or you open with it.`;
        case "unavailable":
        case "offline":
            return `${name} couldn't be reached. Check your connection and try again.`;
        default:
            return syncErrorText(error, name);
    }
}

export const SAVE_TO_LABEL = "Save to…";
export const OPEN_FROM_LABEL = "Open from…";
export const SAVE_LABEL = "Save";
export const UNLINK_LABEL = "Unlink";
export const ALLOW_ACCESS_LABEL = "Allow access";
export const DOWNLOAD_COPY_LABEL = "Download a copy";
export const IMPORT_COPY_LABEL = "Import a file (a copy)";

/** Spec R8: offered when the linked file refuses a save (a view-only share). */
export function saveCopyLabel(connector: ConnectorId): string {
    switch (connector) {
        case "google-drive":
            return "Save a copy to my Drive";
        case "onedrive":
            return "Save a copy to my OneDrive";
        case "local-file":
            return "Save a copy";
    }
}

export const SAVED_IN_BROWSER = "Saved in this browser";
/** Tier 2 (spec R7): said wherever a download stands in for a linked file. */
export const DOWNLOAD_IS_A_COPY =
    "This browser can't keep a file linked, so saving downloads a copy. Later changes stay here until you download again, and opening a file imports it as a copy.";
export const DOWNLOAD_COPY_HINT = "A copy: later changes won't update it.";
/** A cloud connector's menu item while its sign-in loads. */
export const LOADING_HINT = "Loading…";

export function statusText(state: SyncState | "unlinked" | "needs-permission" | "offline", name: string): string {
    switch (state) {
        case "unlinked":
            return SAVED_IN_BROWSER;
        case "in-sync":
            return `Saved to ${name}`;
        case "unsaved":
            return `Unsaved changes: not yet in ${name}`;
        case "newer-available":
            return `Updated from ${name}`;
        case "conflict":
            return `${name} changed while you were editing`;
        case "overwritten":
            return `Your save to ${name} was replaced`;
        case "needs-permission":
            return `The browser needs your permission to use ${name}`;
        case "offline":
            return `Saved on this device. It will need saving to ${name}`;
    }
}

/**
 * OneDrive with a work or school account whose app folder can't be reached
 * (spec R6). Only a build with OPENLEAGUE_MICROSOFT_ACCOUNTS=any signs in such
 * an account, so only that build can show this.
 */
export const ONEDRIVE_APP_FOLDER_UNAVAILABLE =
    "OneDrive couldn't open the planner's folder for this work or school account. Your organization may not allow it. " +
    "Save to a file on this computer, or connect OneDrive with a personal Microsoft account.";

/** The folder chosen for new files is gone (storage locations design). */
export const LOCATION_MISSING_MESSAGE = "The folder chosen for new files is gone, or the planner can no longer reach it. Choose another folder, or the default, in Saved files.";

export const STORE_FAILED_MESSAGE = "Couldn't update this document. Please try again.";

/** A failed step in words; null when there's nothing to say (a cancelled picker). */
export function syncErrorText(error: SyncError, name: string): string | null {
    switch (error.code) {
        case "cancelled":
        case "conflict":
            return null;
        case "not-found":
            return `${name} is gone, or was moved or renamed outside the planner. Save to a new file, or unlink it.`;
        case "forbidden":
            return `You can't save to ${name}: it may be shared with you as view-only. Save a copy instead.`;
        case "auth-required":
            return `The browser needs your permission to use ${name}. Tap ${ALLOW_ACCESS_LABEL}.`;
        case "offline":
            return "You're offline. Your changes are saved in this browser; save again when you're back online.";
        case "too-large":
            return "This document is too large to save there.";
        case "quota":
            return "That storage is full.";
        case "unavailable":
            return `${name} couldn't be reached. Try again.`;
        case "provider":
            return "Saving failed. Try again.";
        case "unwritable":
            return error.message;
        case "app-folder-unavailable":
            return ONEDRIVE_APP_FOLDER_UNAVAILABLE;
        case "location-missing":
            return LOCATION_MISSING_MESSAGE;
        case "not-linked":
            return "This document isn't saved to a file.";
        case "missing-local":
            return "This document is no longer in this browser.";
        case "no-connector":
            return "That storage isn't available in this browser.";
        case "unreadable":
            return `${name} can't be opened: ${error.message}`;
    }
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "last saved" as people read it; "unknown" when the time is missing or bad. */
export function savedAtText(iso: string | null | undefined): string {
    if (!iso) return "unknown";
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? "unknown" : timeFormat.format(at);
}
