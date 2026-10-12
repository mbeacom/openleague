/**
 * OneDrive in the entry chunk (storage connectors spec R6, R9): a stand-in
 * that loads the real connector (onedrive.ts, with MSAL) through import() on
 * first use, so a coach who never touches OneDrive never downloads MSAL. The
 * app builds it only when OPENLEAGUE_MICROSOFT_CLIENT_ID was set at build.
 *
 * A sign-in popup must open inside the tap that asked for it, so the screens
 * call prepare() when a menu offering OneDrive opens: by the time the coach
 * taps "OneDrive…", the chunk is loaded and MSAL has read its cache.
 */
import { connectorFail, type ConnectorStatus, type Result, type StorageConnector } from "./connector";
import type { MicrosoftAccounts } from "../../cloud-config";
import type { MicrosoftAccountType, OneDriveConnector } from "./onedrive";

type OneDriveModule = Pick<typeof import("./onedrive"), "createOneDriveFromConfig">;

export interface LazyOneDriveOptions {
    clientId: string;
    /** Which accounts may sign in (the build's OPENLEAGUE_MICROSOFT_ACCOUNTS); personal when omitted. */
    accounts?: MicrosoftAccounts;
    /** auth/redirect.html beside the planner's page; computed from the page's address when omitted. */
    redirectUri?: string;
    /** The real connector's module (tests pass their own). */
    load?: () => Promise<OneDriveModule>;
}

/** The stand-in, with what the OneDrive settings need beyond a StorageConnector. */
export interface LazyOneDriveConnector extends StorageConnector {
    readonly id: "onedrive";
    /** Starts loading the real connector; resolves when status() is current. Never rejects. */
    prepare: () => Promise<void>;
    /** True once prepare() has loaded the real connector, so connect() opens its popup straight from the tap. */
    prepared: () => boolean;
    accountType: () => MicrosoftAccountType | null;
    /** The build's audience: the screens mention work or school accounts only when it is `any`. */
    readonly accounts: MicrosoftAccounts;
}

/**
 * The redirect page's address, from this page's: works at /planner/, on a
 * fork's subpath and on the dev server. The hash route is dropped.
 */
export function redirectUriFor(pageUrl: string): string {
    return new URL("auth/redirect.html", pageUrl).href;
}

export function isOneDriveConnector(connector: StorageConnector): connector is LazyOneDriveConnector {
    return connector.id === "onedrive" && typeof (connector as Partial<LazyOneDriveConnector>).accountType === "function";
}

export function createLazyOneDriveConnector({ clientId, accounts = "personal", redirectUri, load = () => import("./onedrive") }: LazyOneDriveOptions): LazyOneDriveConnector {
    let real: OneDriveConnector | null = null;
    let loading: Promise<OneDriveConnector | null> | null = null;

    const get = (): Promise<OneDriveConnector | null> =>
        (loading ??= (async () => {
            try {
                const loaded = await load();
                const connector = loaded.createOneDriveFromConfig({ clientId, accounts, redirectUri: redirectUri ?? redirectUriFor(globalThis.location.href) });
                await connector.ready();
                real = connector;
                return connector;
            } catch (error) {
                // A failed chunk load or MSAL start: try again on the next call.
                console.error("OneDrive failed to load:", error instanceof Error ? error.name : "unknown");
                loading = null;
                return null;
            }
        })());

    async function call<T>(work: (connector: OneDriveConnector) => Promise<Result<T>>): Promise<Result<T>> {
        const connector = await get();
        return connector ? work(connector) : connectorFail({ code: "unavailable" });
    }

    return {
        id: "onedrive",
        accounts,
        capabilities: { list: true, pick: false, delete: false, conditionalWrite: "atomic" },
        // Configured: "disconnected" until the real connector has read MSAL's cache.
        status: (): ConnectorStatus => real?.status() ?? "disconnected",
        accountType: () => real?.accountType() ?? null,
        prepare: async () => {
            await get();
        },
        prepared: () => real !== null,
        connect: () => call((connector) => connector.connect()),
        disconnect: async () => {
            const connector = await get();
            await connector?.disconnect();
        },
        list: (filter) => call((connector) => connector.list(filter)),
        pickToOpen: (filter) => call((connector) => connector.pickToOpen(filter)),
        open: (ref) => call((connector) => connector.open(ref)),
        save: (input) => call((connector) => connector.save(input)),
    };
}
