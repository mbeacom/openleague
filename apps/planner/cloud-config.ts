/**
 * Cloud storage connectors' build-time settings (storage connectors spec R9;
 * ADR-0022). Pure, like ai-origins.ts and build-config.ts: the Vite config
 * reads the OPENLEAGUE_* cloud variables once, hands the result to the app as
 * constants and to the CSP as host additions, so the page can never reach a
 * provider its policy doesn't name, or name one the app can't use.
 *
 * Every value is public by nature (it ships in the page). A provider is built
 * in only when all of its values are set; with none set, the build is the app
 * without cloud connectors and its CSP is exactly what it was before them.
 */

export interface GoogleCloudSettings {
    /** The OAuth client id (Web application), for the Google Identity Services token client. */
    clientId: string;
    /** A browser API key restricted to the Picker API and to the site's referrers. */
    apiKey: string;
    /** The Cloud project number, for PickerBuilder.setAppId. */
    appId: string;
}

/**
 * Which Microsoft accounts may sign in, matching the Entra registration's
 * "Supported account types": `personal` (personal Microsoft accounts only, the
 * /consumers authority) or `any` (work or school and personal, /common).
 */
export type MicrosoftAccounts = "personal" | "any";

export interface MicrosoftCloudSettings {
    /** The Entra application (client) id of a single-page application registration. */
    clientId: string;
    /** From OPENLEAGUE_MICROSOFT_ACCOUNTS; `personal` when unset. */
    accounts: MicrosoftAccounts;
}

/**
 * The sign-in authority for each audience. Microsoft's MSAL configuration
 * guide ("Application configuration options", Authority) lists /consumers as
 * personal Microsoft accounts only and /common as work or school or personal,
 * and says the authority must be consistent with the registration's supported
 * account types; a personal-only registration refuses work or school sign-in.
 */
export const MICROSOFT_AUTHORITIES: Readonly<Record<MicrosoftAccounts, string>> = {
    personal: "https://login.microsoftonline.com/consumers",
    any: "https://login.microsoftonline.com/common",
};

export interface CloudSettings {
    google: GoogleCloudSettings | null;
    microsoft: MicrosoftCloudSettings | null;
}

export const NO_CLOUD: CloudSettings = { google: null, microsoft: null };

export const GOOGLE_VARIABLES = ["OPENLEAGUE_GOOGLE_CLIENT_ID", "OPENLEAGUE_GOOGLE_API_KEY", "OPENLEAGUE_GOOGLE_APP_ID"] as const;
export const MICROSOFT_VARIABLES = ["OPENLEAGUE_MICROSOFT_CLIENT_ID", "OPENLEAGUE_MICROSOFT_ACCOUNTS"] as const;

export type CloudVariable = (typeof GOOGLE_VARIABLES)[number] | (typeof MICROSOFT_VARIABLES)[number];
export type CloudEnvironment = Readonly<Partial<Record<string, string | undefined>>>;

const GOOGLE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;
const GOOGLE_API_KEY = /^[\w-]+$/;
const GOOGLE_APP_ID = /^\d+$/;
const MICROSOFT_CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MICROSOFT_ACCOUNTS = /^(?:personal|any)$/;

const valueOf = (env: CloudEnvironment, name: CloudVariable): string => (env[name] ?? "").trim();

function checked(name: CloudVariable, value: string, shape: RegExp, expected: string): string {
    // The value itself is never echoed: the API key arrives through a secret.
    if (!shape.test(value)) throw new Error(`${name} must be ${expected}.`);
    return value;
}

/**
 * The providers this build carries. A provider with some but not all of its
 * variables set fails the build, as does a value of the wrong shape: a
 * half-configured connector would ship a button that can't work.
 * OPENLEAGUE_MICROSOFT_ACCOUNTS has a default (`personal`), so it alone never
 * builds OneDrive; a value other than `personal` or `any` fails either way.
 */
export function resolveCloudSettings(env: CloudEnvironment): CloudSettings {
    const google = GOOGLE_VARIABLES.map((name) => valueOf(env, name));
    const setGoogle = google.filter((value) => value.length > 0).length;
    if (setGoogle > 0 && setGoogle < GOOGLE_VARIABLES.length) {
        const missing = GOOGLE_VARIABLES.filter((name) => valueOf(env, name).length === 0);
        throw new Error(`Google Drive needs all of ${GOOGLE_VARIABLES.join(", ")}; missing ${missing.join(", ")}.`);
    }
    const microsoft = valueOf(env, "OPENLEAGUE_MICROSOFT_CLIENT_ID");
    const accountsValue = valueOf(env, "OPENLEAGUE_MICROSOFT_ACCOUNTS");
    const accounts: MicrosoftAccounts =
        accountsValue.length === 0 ? "personal" : (checked("OPENLEAGUE_MICROSOFT_ACCOUNTS", accountsValue, MICROSOFT_ACCOUNTS, "personal or any") as MicrosoftAccounts);
    return {
        google:
            setGoogle === 0
                ? null
                : {
                      clientId: checked("OPENLEAGUE_GOOGLE_CLIENT_ID", google[0], GOOGLE_CLIENT_ID, "an OAuth client id ending in .apps.googleusercontent.com"),
                      apiKey: checked("OPENLEAGUE_GOOGLE_API_KEY", google[1], GOOGLE_API_KEY, "an API key (letters, digits, '-' and '_')"),
                      appId: checked("OPENLEAGUE_GOOGLE_APP_ID", google[2], GOOGLE_APP_ID, "the Cloud project number (digits only)"),
                  },
        microsoft:
            microsoft.length === 0
                ? null
                : { clientId: checked("OPENLEAGUE_MICROSOFT_CLIENT_ID", microsoft, MICROSOFT_CLIENT_ID, "an application (client) id, a GUID"), accounts },
    };
}

/** CSP sources a provider adds, by directive. */
export type CspAdditions = Partial<Record<"script-src" | "style-src" | "connect-src" | "frame-src", readonly string[]>>;

/**
 * Google Drive (spec R5, Security and privacy). Confirmed against Google's
 * docs (2026-10-11):
 * - Identity Services lists script-src https://accounts.google.com/gsi/client,
 *   frame-src and connect-src https://accounts.google.com/gsi/, and style-src
 *   https://accounts.google.com/gsi/style (GIS setup, "Content Security Policy").
 * - The Picker loads from https://apis.google.com/js/api.js (and gapi.load
 *   fetches the picker module from the same host) and renders in an iframe on
 *   https://docs.google.com (Picker web guide and sample).
 * - Drive REST and uploads are https://www.googleapis.com; the token client's
 *   revoke goes to https://oauth2.googleapis.com.
 * - content.googleapis.com is gapi's API proxy host; the connector calls Drive
 *   with fetch, but gapi's loader may still frame or call it, so the spec keeps it.
 */
export const GOOGLE_CSP: CspAdditions = {
    "script-src": ["https://apis.google.com", "https://accounts.google.com/gsi/client"],
    "style-src": ["https://accounts.google.com/gsi/style"],
    "connect-src": ["https://accounts.google.com/gsi/", "https://www.googleapis.com", "https://content.googleapis.com", "https://oauth2.googleapis.com"],
    "frame-src": ["https://docs.google.com", "https://accounts.google.com/gsi/", "https://content.googleapis.com"],
};

/**
 * OneDrive (spec R6, Security and privacy), keyed on
 * OPENLEAGUE_MICROSOFT_CLIENT_ID and OPENLEAGUE_MICROSOFT_ACCOUNTS. MSAL is
 * bundled (no script host). Phase 4a's findings:
 * - connect-src: the sign-in authority (token and discovery requests), Graph,
 *   and the hosts Graph's pre-authenticated download URLs point to. A browser
 *   can't read a file through Graph's /content (a 302 after a CORS preflight is
 *   refused; Microsoft documents this), so the connector fetches the item's
 *   `@microsoft.graph.downloadUrl`: `*.files.1drv.com` or
 *   `my.microsoftpersonalcontent.com` for personal accounts, and the tenant's
 *   `*.sharepoint.com` host for work or school accounts, listed only when the
 *   build accepts them (`any`).
 * - frame-src: required. Once the 24-hour SPA refresh token expires, MSAL
 *   renews in a hidden iframe that loads the authority and ends on the
 *   planner's own auth/redirect.html ('self', added by plannerCsp whenever
 *   frame-src is set). A personal account's sign-in hands off to
 *   login.live.com, so that hop is listed for both audiences; Microsoft
 *   publishes no CSP host list, so the manual checklist confirms it.
 */
export function microsoftCsp(settings: MicrosoftCloudSettings | null): CspAdditions {
    if (!settings) return {};
    return {
        "connect-src": [
            "https://login.microsoftonline.com",
            "https://graph.microsoft.com",
            "https://*.files.1drv.com",
            "https://my.microsoftpersonalcontent.com",
            ...(settings.accounts === "any" ? ["https://*.sharepoint.com"] : []),
        ],
        "frame-src": ["https://login.microsoftonline.com", "https://login.live.com"],
    };
}

/** Google's additions when its connector is built, else none. */
export function googleCsp(settings: GoogleCloudSettings | null): CspAdditions {
    return settings ? GOOGLE_CSP : {};
}

/** Every provider's additions for this build, merged without duplicates, in provider order. */
export function cloudCspAdditions(cloud: CloudSettings): CspAdditions {
    const merged: Record<string, string[]> = {};
    for (const additions of [googleCsp(cloud.google), microsoftCsp(cloud.microsoft)]) {
        for (const [directive, sources] of Object.entries(additions)) {
            const list = (merged[directive] ??= []);
            for (const source of sources ?? []) if (!list.includes(source)) list.push(source);
        }
    }
    return merged;
}
