/**
 * Cloud storage connectors' build-time settings (storage connectors spec R9;
 * ADR-0022). Pure, like ai-origins.ts and build-config.ts: the Vite config
 * reads the four OPENLEAGUE_* variables once, hands the result to the app as
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

export interface MicrosoftCloudSettings {
    /** The Entra application (client) id of a single-page application registration. */
    clientId: string;
}

export interface CloudSettings {
    google: GoogleCloudSettings | null;
    microsoft: MicrosoftCloudSettings | null;
}

export const NO_CLOUD: CloudSettings = { google: null, microsoft: null };

export const GOOGLE_VARIABLES = ["OPENLEAGUE_GOOGLE_CLIENT_ID", "OPENLEAGUE_GOOGLE_API_KEY", "OPENLEAGUE_GOOGLE_APP_ID"] as const;
export const MICROSOFT_VARIABLES = ["OPENLEAGUE_MICROSOFT_CLIENT_ID"] as const;

export type CloudVariable = (typeof GOOGLE_VARIABLES)[number] | (typeof MICROSOFT_VARIABLES)[number];
export type CloudEnvironment = Readonly<Partial<Record<string, string | undefined>>>;

const GOOGLE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;
const GOOGLE_API_KEY = /^[\w-]+$/;
const GOOGLE_APP_ID = /^\d+$/;
const MICROSOFT_CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 */
export function resolveCloudSettings(env: CloudEnvironment): CloudSettings {
    const google = GOOGLE_VARIABLES.map((name) => valueOf(env, name));
    const setGoogle = google.filter((value) => value.length > 0).length;
    if (setGoogle > 0 && setGoogle < GOOGLE_VARIABLES.length) {
        const missing = GOOGLE_VARIABLES.filter((name) => valueOf(env, name).length === 0);
        throw new Error(`Google Drive needs all of ${GOOGLE_VARIABLES.join(", ")}; missing ${missing.join(", ")}.`);
    }
    const microsoft = valueOf(env, "OPENLEAGUE_MICROSOFT_CLIENT_ID");
    return {
        google:
            setGoogle === 0
                ? null
                : {
                      clientId: checked("OPENLEAGUE_GOOGLE_CLIENT_ID", google[0], GOOGLE_CLIENT_ID, "an OAuth client id ending in .apps.googleusercontent.com"),
                      apiKey: checked("OPENLEAGUE_GOOGLE_API_KEY", google[1], GOOGLE_API_KEY, "an API key (letters, digits, '-' and '_')"),
                      appId: checked("OPENLEAGUE_GOOGLE_APP_ID", google[2], GOOGLE_APP_ID, "the Cloud project number (digits only)"),
                  },
        microsoft: microsoft.length === 0 ? null : { clientId: checked("OPENLEAGUE_MICROSOFT_CLIENT_ID", microsoft, MICROSOFT_CLIENT_ID, "an application (client) id, a GUID") },
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
 * OPENLEAGUE_MICROSOFT_CLIENT_ID. MSAL is bundled (no script host). Silent
 * renewal loads the authority in a hidden iframe that ends on the planner's
 * own auth/redirect.html, so frame-src needs the authority and 'self' (added
 * by plannerCsp whenever frame-src is set). The OneDrive connector owns this
 * list: whether personal sign-in passes through https://login.live.com inside
 * that iframe, and where Graph's content downloads redirect, are phase 4a's
 * checks.
 */
export function microsoftCsp(settings: MicrosoftCloudSettings | null): CspAdditions {
    if (!settings) return {};
    return {
        "connect-src": ["https://login.microsoftonline.com", "https://graph.microsoft.com"],
        "frame-src": ["https://login.microsoftonline.com"],
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
