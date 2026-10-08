/**
 * Request, abort and error plumbing the three adapters share (spec R2, R5).
 * Never throws. Errors carry our own wording, the HTTP status and the
 * provider's error type, never a request header or the key.
 */
import { isAllowedUrl, isLoopbackHost } from "../origins";
import type { AiErrorCode, AiEvent } from "../types";

export const AI_ERROR_MESSAGES: Record<Exclude<AiErrorCode, "other">, string> = {
    auth: "The provider didn't accept the key. Check that it was pasted in full, or create a new one in the provider's console.",
    "rate-limit": "The provider says too many requests were made. Wait a minute, then try again.",
    "spend-limit": "Your account at the provider has reached its spend limit or has no credit left. Check billing in the provider's console.",
    network: "Couldn't reach the provider. Check your internet connection and try again.",
    cors:
        "Couldn't reach the AI server on this computer. Check that it is running, that it allows requests from this page " +
        "(its CORS or allowed-origins setting), and that the browser allowed the connection: some browsers ask first, " +
        "and some block http://localhost from an https page.",
    refused: "The model declined this request. Try rewording the notes.",
    "bad-output": "The reply wasn't a usable draft.",
    aborted: "Stopped. Nothing was saved.",
};

export const CUT_OFF_MESSAGE = "The reply was cut off at the output limit before the draft was complete. Try shorter notes.";
export const NOT_ALLOWED_MESSAGE =
    "This address isn't on the planner's list of allowed AI servers. Use a server on this computer (localhost or 127.0.0.1), or a provider the planner supports.";
const MODEL_HINT = "If the model name is wrong, or the model doesn't support structured output, choose another model in AI settings.";

export function aiError(code: AiErrorCode, message?: string): AiEvent {
    return { type: "error", code, message: message ?? (code === "other" ? "The provider returned an error." : AI_ERROR_MESSAGES[code]) };
}

/** A provider's error text, safe to show: the key removed, one line, bounded. */
export function scrubbed(text: unknown, apiKey: string): string | null {
    if (typeof text !== "string" || !text.trim()) return null;
    let clean = text;
    if (apiKey) clean = clean.split(apiKey).join("[key]");
    // Anything that still looks like a credential (a long token after sk- or similar) is masked too.
    clean = clean.replace(/\b(sk|key|token)[-_][A-Za-z0-9_-]{8,}/gi, "[key]");
    clean = clean.replace(/\s+/g, " ").trim();
    return clean.length > 300 ? `${clean.slice(0, 297)}…` : clean;
}

/** The parsed JSON error body of a failed response: `{ error: { type?, code?, message? } }` or `{ type, message }`. */
export interface ProviderErrorBody {
    type: string | null;
    code: string | null;
    message: string | null;
}

export function readErrorBody(raw: unknown): ProviderErrorBody {
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const inner = (root.error && typeof root.error === "object" ? root.error : root) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" && value ? value : null);
    return {
        type: text(inner.type),
        code: text(inner.code),
        message: text(inner.message) ?? (typeof root.error === "string" ? root.error : null),
    };
}

/** An HTTP failure the adapter didn't classify: the status, the provider's error type, its scrubbed message, and the model hint. */
export function otherHttpError(status: number, body: ProviderErrorBody, apiKey: string): AiEvent {
    const label = [`HTTP ${status}`, body.type ?? body.code].filter(Boolean).join(", ");
    const detail = status === 400 || status === 404 || status === 422 ? scrubbed(body.message, apiKey) : null;
    const hint = status === 400 || status === 404 || status === 422 ? ` ${MODEL_HINT}` : "";
    return aiError("other", `The provider returned an error (${label}).${detail ? ` It said: "${detail}"` : ""}${hint}`);
}

const SPEND_WORDS = /spend(ing)? limit|credit balance|billing|quota|insufficient (funds|credit)/i;

/** True when an error's text names a spend cap, credit or billing problem. */
export function mentionsSpendLimit(body: ProviderErrorBody): boolean {
    return [body.type, body.code, body.message].some((text) => text !== null && SPEND_WORDS.test(text));
}

export interface StreamTarget {
    url: string;
    headers: Record<string, string>;
    body: unknown;
}

export interface OpenStreamOptions {
    fetchImpl: typeof fetch;
    allowedOrigins: readonly string[];
    signal: AbortSignal;
    apiKey: string;
    /** Maps a non-2xx response to an error event. */
    classify: (status: number, body: ProviderErrorBody) => AiEvent;
}

export type OpenedStream = { ok: true; body: ReadableStream<Uint8Array> } | { ok: false; event: AiEvent };

export function isLoopbackUrl(url: string): boolean {
    try {
        return isLoopbackHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

/** A thrown fetch or read: aborted, or a network failure (cors for a local server, where that's the likely cause). */
export function failureEvent(error: unknown, signal: AbortSignal, url: string): AiEvent {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return aiError("aborted");
    return aiError(isLoopbackUrl(url) ? "cors" : "network");
}

/**
 * Posts the request and returns the response stream, or an error event. Refuses
 * a URL off the allowlist before any request. Loopback requests carry
 * `targetAddressSpace: "loopback"` (Chrome's Local Network Access: Chrome refuses a
 * loopback server when the request names "local", so the value must match the target).
 */
export async function openStream(target: StreamTarget, options: OpenStreamOptions): Promise<OpenedStream> {
    const { fetchImpl, allowedOrigins, signal, classify } = options;
    if (!isAllowedUrl(target.url, allowedOrigins)) return { ok: false, event: aiError("other", NOT_ALLOWED_MESSAGE) };
    if (signal.aborted) return { ok: false, event: aiError("aborted") };
    // targetAddressSpace isn't in TypeScript's RequestInit yet.
    const init: RequestInit & { targetAddressSpace?: "loopback" } = {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(target.body),
        signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        ...(isLoopbackUrl(target.url) ? { targetAddressSpace: "loopback" as const } : {}),
    };
    let response: Response;
    try {
        response = await fetchImpl(target.url, init);
    } catch (error) {
        return { ok: false, event: failureEvent(error, signal, target.url) };
    }
    if (!response.ok) {
        let raw: unknown = null;
        try {
            raw = JSON.parse(await response.text());
        } catch {
            raw = null;
        }
        return { ok: false, event: classify(response.status, readErrorBody(raw)) };
    }
    if (!response.body) return { ok: false, event: aiError("other", "The provider sent an empty response.") };
    return { ok: true, body: response.body };
}

/** JSON.parse that returns null instead of throwing. */
export function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
