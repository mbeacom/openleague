/**
 * Plan links (ADR-0020): the plan's JSON, deflate-raw compressed and
 * base64url encoded, carried in a `#plan=` fragment so it never reaches a
 * server or its logs. Uses the platform's CompressionStream (browsers and
 * Node 22+). Streams are driven through getWriter/getReader rather than
 * Blob.stream(), which jsdom lacks.
 */

import {
    MAX_PLAN_LINK_BYTES,
    NOT_A_PLAN_MESSAGE,
    parsePlan,
    type ParsePlanResult,
    type PlanDocument,
} from "./document";

export const LINK_TOO_LARGE_MESSAGE = "This plan is too large for a link. Download the file instead.";
export const LINK_UNREADABLE_MESSAGE = "This link doesn't hold a readable OpenLeague practice plan.";
export const LINK_TOO_LARGE_TO_OPEN_MESSAGE = "This link's plan is larger than OpenLeague accepts.";

/** Deflate can grow incompressible data slightly; base64 adds a third. Longer fragments are refused unread. */
export const MAX_PLAN_LINK_ENCODED_LENGTH = Math.ceil(((MAX_PLAN_LINK_BYTES + 1024) * 4) / 3);

export class PlanLinkTooLargeError extends Error {
    constructor(readonly bytes: number) {
        super(`Plan link data is ${bytes} bytes; the limit is ${MAX_PLAN_LINK_BYTES}`);
        this.name = "PlanLinkTooLargeError";
    }
}

export class PlanLinkError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "PlanLinkError";
    }
}

async function pump(
    bytes: Uint8Array<ArrayBuffer>,
    stream: CompressionStream | DecompressionStream,
    limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
    const writer = stream.writable.getWriter();
    // Not awaited: the readable side must drain concurrently, or a large
    // write stalls on backpressure. Failures surface through the reader.
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel().catch(() => {});
            throw new PlanLinkTooLargeError(total);
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

export function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    return pump(bytes, new CompressionStream("deflate-raw"), Number.POSITIVE_INFINITY);
}

/** Throws PlanLinkTooLargeError as soon as the output passes `limit`. */
export function inflateRaw(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    return pump(bytes, new DecompressionStream("deflate-raw"), limit);
}

const CHUNK = 0x8000;

export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new PlanLinkError("Plan link isn't base64url");
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    let binary: string;
    try {
        binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    } catch (error) {
        throw new PlanLinkError("Plan link isn't base64url", error);
    }
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Throws PlanLinkTooLargeError when the plan's JSON exceeds MAX_PLAN_LINK_BYTES. */
export async function encodePlanLink(plan: PlanDocument): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(plan));
    if (bytes.byteLength > MAX_PLAN_LINK_BYTES) throw new PlanLinkTooLargeError(bytes.byteLength);
    return base64UrlEncode(await deflateRaw(bytes));
}

/** The inverse of encodePlanLink. Returns unparsed JSON: call parsePlan on it. */
export async function decodePlanLink(fragmentValue: string): Promise<unknown> {
    if (fragmentValue.length > MAX_PLAN_LINK_ENCODED_LENGTH) throw new PlanLinkTooLargeError(fragmentValue.length);
    if (fragmentValue.length === 0) throw new PlanLinkError("Plan link is empty");
    const compressed = base64UrlDecode(fragmentValue);

    let inflated: Uint8Array<ArrayBuffer>;
    try {
        inflated = await inflateRaw(compressed, MAX_PLAN_LINK_BYTES);
    } catch (error) {
        if (error instanceof PlanLinkTooLargeError) throw error;
        throw new PlanLinkError("Plan link data is damaged", error);
    }

    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    } catch (error) {
        throw new PlanLinkError("Plan link data isn't text", error);
    }
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new PlanLinkError("Plan link data isn't JSON", error);
    }
}

/** decode + parse, with every failure as a PlanError worded for a link. */
export async function readPlanLink(fragmentValue: string): Promise<ParsePlanResult> {
    let raw: unknown;
    try {
        raw = await decodePlanLink(fragmentValue);
    } catch (error) {
        return error instanceof PlanLinkTooLargeError
            ? { ok: false, error: { code: "invalid", message: LINK_TOO_LARGE_TO_OPEN_MESSAGE } }
            : { ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } };
    }
    const result = parsePlan(raw);
    if (!result.ok && result.error.message === NOT_A_PLAN_MESSAGE) {
        return { ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } };
    }
    return result;
}
