/**
 * The provider seam for bring-your-own-key AI assistance (ADR-0023, spec R2).
 * Portable and browser-only: no Next.js, no server code, no vendor SDK.
 */

/** A JSON Schema object, already reduced to the subset every phase-1 provider accepts (spec R8). */
export type JsonSchema = { [key: string]: unknown };

export const PROVIDER_KINDS = ["anthropic", "openai", "openai-compatible"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** What a task asks of any provider. */
export interface AiRequest {
    model: string;
    system: string;
    /** The user's turn as plain text. It is already redacted and already shown in the preview. */
    input: string;
    /** When set, the provider must return JSON matching this schema. */
    output?: { name: string; schema: JsonSchema };
    maxOutputTokens: number;
}

export type AiErrorCode = "auth" | "rate-limit" | "spend-limit" | "network" | "cors" | "refused" | "bad-output" | "aborted" | "other";

export interface AiUsage {
    inputTokens: number;
    outputTokens: number;
}

export type AiEvent =
    | { type: "text"; delta: string }
    | { type: "done"; text: string; usage?: AiUsage }
    | { type: "error"; code: AiErrorCode; message: string };

export interface AiProvider {
    readonly kind: ProviderKind;
    /** Streams events. Cancelled through the signal. Never throws: every failure ends with an error event. */
    send(request: AiRequest, signal: AbortSignal): AsyncIterable<AiEvent>;
}

/** What createProvider needs: the coach's settings plus the key held in memory. */
export interface ProviderConfig {
    kind: ProviderKind;
    /** The coach's key. Optional for a local server. Attached only to this provider's own requests. */
    apiKey: string;
    /** For openai-compatible: the server's OpenAI-compatible base, such as http://localhost:11434/v1. */
    baseUrl?: string;
}

export interface ProviderDeps {
    /** The build's origin allowlist (apps/planner/ai-origins.ts), the same list as connect-src. */
    allowedOrigins: readonly string[];
    /** Injected so tests never reach a real provider. Defaults to the global fetch. */
    fetch?: typeof fetch;
}
