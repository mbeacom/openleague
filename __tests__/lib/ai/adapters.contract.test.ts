/**
 * Adapter contract tests (spec Testing): each adapter against a stubbed fetch
 * returning hand-written fixtures. No test reaches a real provider.
 */
import { describe, expect, it } from "vitest";
import { resolveAiOrigins } from "@/apps/planner/ai-origins";
import { createProvider } from "@/lib/ai/providers";
import { chatCompletionsUrl } from "@/lib/ai/adapters/openai-compatible";
import { ANTHROPIC_MESSAGES_URL } from "@/lib/ai/adapters/anthropic";
import { OPENAI_RESPONSES_URL } from "@/lib/ai/adapters/openai";
import { isAllowedUrl } from "@/lib/ai/origins";
import type { AiEvent, AiProvider, AiRequest, ProviderConfig } from "@/lib/ai/types";
import {
    ANTHROPIC_STREAM,
    ANTHROPIC_STREAM_ERROR,
    COMPATIBLE_LENGTH,
    COMPATIBLE_STREAM,
    DRAFT_JSON,
    ERROR_BODIES,
    OPENAI_INCOMPLETE,
    OPENAI_REFUSAL,
    OPENAI_STREAM,
    OPENAI_STREAM_ERROR,
    REFLECTED_ERROR,
    REFLECTED_STREAM_ERRORS,
    SENTINEL_KEY,
    anthropicStop,
    jsonResponse,
    recordingFetch,
    sseResponse,
} from "./fixtures";

const ORIGINS = resolveAiOrigins(undefined);
const SCHEMA = { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false };
const REQUEST: AiRequest = { model: "test-model", system: "You draft plans.", input: "Notes: 10 min warm-up.", output: { name: "practice_plan_draft", schema: SCHEMA }, maxOutputTokens: 4000 };

async function collect(provider: AiProvider, signal = new AbortController().signal): Promise<AiEvent[]> {
    const events: AiEvent[] = [];
    for await (const event of provider.send(REQUEST, signal)) events.push(event);
    return events;
}

function provider(config: ProviderConfig, respond: () => Response | Promise<Response>) {
    const recorder = recordingFetch(respond);
    return { ...recorder, provider: createProvider(config, { allowedOrigins: ORIGINS, fetch: recorder.fetchImpl }) };
}

const lastOf = (events: AiEvent[]) => events[events.length - 1];
const textOf = (events: AiEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");

/** The key in exactly one header value, and nowhere in the body or the URL. */
function keyOnlyIn(call: { url: string; headers: Record<string, string>; body: unknown }, header: string, value: string) {
    const holding = Object.entries(call.headers).filter(([, v]) => v.includes(SENTINEL_KEY));
    expect(holding).toEqual([[header, value]]);
    expect(call.url).not.toContain(SENTINEL_KEY);
    expect(JSON.stringify(call.body)).not.toContain(SENTINEL_KEY);
}

describe("the fixed provider origins are on the public allowlist", () => {
    it("allows both official endpoints", () => {
        expect(isAllowedUrl(ANTHROPIC_MESSAGES_URL, ORIGINS)).toBe(true);
        expect(isAllowedUrl(OPENAI_RESPONSES_URL, ORIGINS)).toBe(true);
    });

    it("sends nothing when the list lacks the provider's origin", async () => {
        const recorder = recordingFetch(() => sseResponse(ANTHROPIC_STREAM));
        const p = createProvider({ kind: "anthropic", apiKey: SENTINEL_KEY }, { allowedOrigins: ["http://localhost:*"], fetch: recorder.fetchImpl });
        const events = await collect(p);
        expect(recorder.calls).toHaveLength(0);
        expect(lastOf(events)).toMatchObject({ type: "error", code: "other" });
    });
});

describe("anthropic adapter", () => {
    const config: ProviderConfig = { kind: "anthropic", apiKey: SENTINEL_KEY };

    it("posts the Messages request with the browser-access header and structured output", async () => {
        const { calls, provider: p } = provider(config, () => sseResponse(ANTHROPIC_STREAM));
        const events = await collect(p);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.url).toBe("https://api.anthropic.com/v1/messages");
        expect(call.init.method).toBe("POST");
        expect(call.headers).toEqual({
            "content-type": "application/json",
            "x-api-key": SENTINEL_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
        });
        keyOnlyIn(call, "x-api-key", SENTINEL_KEY);
        expect(call.body).toEqual({
            model: "test-model",
            max_tokens: 4000,
            system: "You draft plans.",
            messages: [{ role: "user", content: "Notes: 10 min warm-up." }],
            stream: true,
            output_config: { format: { type: "json_schema", schema: SCHEMA } },
        });
        expect(call.init.targetAddressSpace).toBeUndefined();
        expect(call.init.credentials).toBe("omit");
        expect(textOf(events)).toBe(DRAFT_JSON);
        expect(lastOf(events)).toEqual({ type: "done", text: DRAFT_JSON, usage: { inputTokens: 120, outputTokens: 42 } });
    });

    it.each([
        ["401", () => jsonResponse(401, ERROR_BODIES.anthropicAuth), "auth"],
        ["429", () => jsonResponse(429, ERROR_BODIES.anthropicRate), "rate-limit"],
        ["a 400 spend limit", () => jsonResponse(400, ERROR_BODIES.anthropicSpend), "spend-limit"],
        ["a 400 credit balance", () => jsonResponse(400, ERROR_BODIES.anthropicCredit), "spend-limit"],
        ["402", () => jsonResponse(402, { type: "error", error: { type: "billing_error", message: "Billing" } }), "spend-limit"],
        ["a refusal", () => sseResponse(anthropicStop("refusal")), "refused"],
        ["a cut-off reply", () => sseResponse(anthropicStop("max_tokens")), "bad-output"],
        ["a mid-stream error", () => sseResponse(ANTHROPIC_STREAM_ERROR), "other"],
        ["404 model", () => jsonResponse(404, ERROR_BODIES.anthropicBadModel), "other"],
        ["a stream that stops early", () => sseResponse(ANTHROPIC_STREAM.split("event: message_delta")[0]), "network"],
    ])("maps %s to its error code", async (_label, respond, code) => {
        const events = await collect(provider(config, respond).provider);
        expect(lastOf(events)).toMatchObject({ type: "error", code });
    });

    it("reports a network failure as network", async () => {
        const events = await collect(provider(config, () => Promise.reject(new TypeError("Failed to fetch"))).provider);
        expect(lastOf(events)).toMatchObject({ type: "error", code: "network" });
    });
});

describe("openai adapter", () => {
    const config: ProviderConfig = { kind: "openai", apiKey: SENTINEL_KEY };

    it("posts a Responses request with strict json_schema and store: false", async () => {
        const { calls, provider: p } = provider(config, () => sseResponse(OPENAI_STREAM));
        const events = await collect(p);
        const [call] = calls;
        expect(call.url).toBe("https://api.openai.com/v1/responses");
        expect(call.init.method).toBe("POST");
        expect(call.headers).toEqual({ "content-type": "application/json", authorization: `Bearer ${SENTINEL_KEY}` });
        keyOnlyIn(call, "authorization", `Bearer ${SENTINEL_KEY}`);
        expect(call.body).toEqual({
            model: "test-model",
            instructions: "You draft plans.",
            input: "Notes: 10 min warm-up.",
            max_output_tokens: 4000,
            stream: true,
            store: false,
            text: { format: { type: "json_schema", name: "practice_plan_draft", schema: SCHEMA, strict: true } },
        });
        expect(call.init.targetAddressSpace).toBeUndefined();
        expect(textOf(events)).toBe(DRAFT_JSON);
        expect(lastOf(events)).toEqual({ type: "done", text: DRAFT_JSON, usage: { inputTokens: 120, outputTokens: 42 } });
    });

    it.each([
        ["401", () => jsonResponse(401, ERROR_BODIES.openaiAuth), "auth"],
        ["429 rate limit", () => jsonResponse(429, ERROR_BODIES.openaiRate), "rate-limit"],
        ["429 insufficient_quota", () => jsonResponse(429, ERROR_BODIES.openaiQuota), "spend-limit"],
        ["a refusal", () => sseResponse(OPENAI_REFUSAL), "refused"],
        ["a cut-off reply", () => sseResponse(OPENAI_INCOMPLETE), "bad-output"],
        ["a mid-stream error event", () => sseResponse(OPENAI_STREAM_ERROR), "rate-limit"],
        ["404 model", () => jsonResponse(404, ERROR_BODIES.openaiBadModel), "other"],
    ])("maps %s to its error code", async (_label, respond, code) => {
        const events = await collect(provider(config, respond).provider);
        expect(lastOf(events)).toMatchObject({ type: "error", code });
    });

    it("never repeats the key in an error, even when the provider echoes it", async () => {
        for (const body of [ERROR_BODIES.openaiAuth, ERROR_BODIES.openaiBadModel]) {
            const events = await collect(provider(config, () => jsonResponse(body === ERROR_BODIES.openaiAuth ? 401 : 404, body)).provider);
            expect(JSON.stringify(events)).not.toContain(SENTINEL_KEY);
        }
        const other = lastOf(await collect(provider(config, () => jsonResponse(404, ERROR_BODIES.openaiBadModel)).provider));
        expect(other.type === "error" && other.message).toMatch(/HTTP 404, invalid_request_error.*does not exist.*\[key\].*choose another model/);
    });
});

describe("openai-compatible adapter", () => {
    const config: ProviderConfig = { kind: "openai-compatible", apiKey: "", baseUrl: "http://localhost:11434/v1/" };

    it("posts Chat Completions to the local base with response_format and targetAddressSpace", async () => {
        const { calls, provider: p } = provider(config, () => sseResponse(COMPATIBLE_STREAM));
        const events = await collect(p);
        const [call] = calls;
        expect(call.url).toBe("http://localhost:11434/v1/chat/completions");
        expect(call.init.method).toBe("POST");
        expect(call.headers).toEqual({ "content-type": "application/json" });
        expect(call.init.targetAddressSpace).toBe("loopback");
        expect(call.body).toEqual({
            model: "test-model",
            messages: [
                { role: "system", content: "You draft plans." },
                { role: "user", content: "Notes: 10 min warm-up." },
            ],
            max_tokens: 4000,
            stream: true,
            stream_options: { include_usage: true },
            response_format: { type: "json_schema", json_schema: { name: "practice_plan_draft", schema: SCHEMA, strict: true } },
        });
        expect(lastOf(events)).toEqual({ type: "done", text: DRAFT_JSON, usage: { inputTokens: 120, outputTokens: 42 } });
    });

    it("sends a key the coach entered in Authorization only", async () => {
        const { calls, provider: p } = provider({ ...config, apiKey: SENTINEL_KEY }, () => sseResponse(COMPATIBLE_STREAM));
        await collect(p);
        keyOnlyIn(calls[0], "authorization", `Bearer ${SENTINEL_KEY}`);
    });

    it("sets targetAddressSpace for loopback base URLs only", async () => {
        const selfHosted = resolveAiOrigins("https://models.example:8443");
        for (const [baseUrl, local] of [
            ["http://127.0.0.1:1234/v1", true],
            ["https://localhost:8443/v1", true],
            ["https://models.example:8443/v1", false],
        ] as const) {
            const recorder = recordingFetch(() => sseResponse(COMPATIBLE_STREAM));
            const p = createProvider({ ...config, baseUrl }, { allowedOrigins: selfHosted, fetch: recorder.fetchImpl });
            await collect(p);
            expect(recorder.calls[0].init.targetAddressSpace).toBe(local ? "loopback" : undefined);
        }
    });

    it("refuses a base URL off the allowlist without a request", async () => {
        for (const baseUrl of ["https://models.example:8443/v1", "http://192.168.1.20:11434/v1", "http://[::1]:11434/v1", "not a url", "http://localhost:11434/v1?x=1"]) {
            const recorder = recordingFetch(() => sseResponse(COMPATIBLE_STREAM));
            const events = await collect(createProvider({ ...config, baseUrl }, { allowedOrigins: ORIGINS, fetch: recorder.fetchImpl }));
            expect(recorder.calls).toHaveLength(0);
            expect(lastOf(events)).toMatchObject({ type: "error", code: "other" });
        }
    });

    it.each([
        ["401", () => jsonResponse(401, { error: { message: "unauthorized" } }), "auth"],
        ["429", () => jsonResponse(429, { error: { message: "busy" } }), "rate-limit"],
        ["a cut-off reply", () => sseResponse(COMPATIBLE_LENGTH), "bad-output"],
        ["a refusal", () => sseResponse(`data: ${JSON.stringify({ choices: [{ delta: { refusal: "No." }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`), "refused"],
        ["a blocked request (CORS or the browser)", () => Promise.reject(new TypeError("Failed to fetch")), "cors"],
        ["404 model", () => jsonResponse(404, { error: { message: "model 'llama-x' not found" } }), "other"],
    ])("maps %s to its error code", async (_label, respond, code) => {
        const events = await collect(provider(config, respond).provider);
        expect(lastOf(events)).toMatchObject({ type: "error", code });
    });

    it("names both causes when a local request fails", async () => {
        const events = await collect(provider(config, () => Promise.reject(new TypeError("Failed to fetch"))).provider);
        const last = lastOf(events);
        expect(last.type === "error" && last.message).toMatch(/CORS or allowed-origins setting/);
        expect(last.type === "error" && last.message).toMatch(/browser/);
    });

    it("builds the chat completions URL from a base", () => {
        expect(chatCompletionsUrl("http://localhost:1234/v1", ORIGINS)).toEqual({ ok: true, url: "http://localhost:1234/v1/chat/completions" });
        expect(chatCompletionsUrl(" http://127.0.0.1:11434/v1// ", ORIGINS)).toEqual({ ok: true, url: "http://127.0.0.1:11434/v1/chat/completions" });
        expect(chatCompletionsUrl("http://user:pw@localhost:1/v1", ORIGINS).ok).toBe(false);
    });
});

describe("aborting", () => {
    it.each<[string, ProviderConfig]>([
        ["anthropic", { kind: "anthropic", apiKey: SENTINEL_KEY }],
        ["openai", { kind: "openai", apiKey: SENTINEL_KEY }],
        ["openai-compatible", { kind: "openai-compatible", apiKey: "", baseUrl: "http://localhost:11434/v1" }],
    ])("%s ends with aborted when the signal fires mid-stream, and never throws", async (_label, config) => {
        const controller = new AbortController();
        // A stream that sends one delta and then waits until the abort errors it.
        const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
            const encoder = new TextEncoder();
            const first =
                config.kind === "anthropic"
                    ? 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{"}}\n\n'
                    : config.kind === "openai"
                      ? 'data: {"type":"response.output_text.delta","delta":"{"}\n\n'
                      : 'data: {"choices":[{"delta":{"content":"{"}}]}\n\n';
            const body = new ReadableStream<Uint8Array>({
                start(stream) {
                    stream.enqueue(encoder.encode(first));
                    init?.signal?.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")));
                },
            });
            return new Response(body, { status: 200 });
        }) as typeof fetch;
        const p = createProvider(config, { allowedOrigins: ORIGINS, fetch: fetchImpl });
        const events: AiEvent[] = [];
        for await (const event of p.send(REQUEST, controller.signal)) {
            events.push(event);
            if (event.type === "text") controller.abort();
        }
        expect(lastOf(events)).toMatchObject({ type: "error", code: "aborted" });
    });

    it("makes no request when already aborted", async () => {
        const recorder = recordingFetch(() => sseResponse(OPENAI_STREAM));
        const controller = new AbortController();
        controller.abort();
        const p = createProvider({ kind: "openai", apiKey: SENTINEL_KEY }, { allowedOrigins: ORIGINS, fetch: recorder.fetchImpl });
        expect(lastOf(await collect(p, controller.signal))).toMatchObject({ code: "aborted" });
        expect(recorder.calls).toHaveLength(0);
    });
});

describe("a provider's error fields never carry the key into an error event", () => {
    const anthropic: ProviderConfig = { kind: "anthropic", apiKey: SENTINEL_KEY };
    const openai: ProviderConfig = { kind: "openai", apiKey: SENTINEL_KEY };
    const compatible: ProviderConfig = { kind: "openai-compatible", apiKey: SENTINEL_KEY, baseUrl: "http://localhost:11434/v1" };
    const httpBody = { error: REFLECTED_ERROR };

    it.each<[string, ProviderConfig, () => Response]>([
        ["anthropic HTTP 400", anthropic, () => jsonResponse(400, { type: "error", ...httpBody })],
        ["anthropic HTTP 500", anthropic, () => jsonResponse(500, { type: "error", ...httpBody })],
        ["anthropic mid-stream", anthropic, () => sseResponse(REFLECTED_STREAM_ERRORS.anthropic)],
        ["openai HTTP 400", openai, () => jsonResponse(400, httpBody)],
        ["openai HTTP 500 (type only)", openai, () => jsonResponse(500, { error: { type: REFLECTED_ERROR.type, message: REFLECTED_ERROR.message } })],
        ["openai mid-stream error code", openai, () => sseResponse(REFLECTED_STREAM_ERRORS.openaiError)],
        ["openai mid-stream error type", openai, () => sseResponse(REFLECTED_STREAM_ERRORS.openaiErrorType)],
        ["openai response.failed", openai, () => sseResponse(REFLECTED_STREAM_ERRORS.openaiFailed)],
        ["openai-compatible HTTP 400", compatible, () => jsonResponse(400, httpBody)],
        ["openai-compatible HTTP 500 (code only)", compatible, () => jsonResponse(500, { error: { code: REFLECTED_ERROR.code } })],
        ["openai-compatible mid-stream", compatible, () => sseResponse(REFLECTED_STREAM_ERRORS.compatible)],
    ])("%s", async (_label, config, respond) => {
        const events = await collect(provider(config, respond).provider);
        const last = lastOf(events);
        expect(last.type).toBe("error");
        expect(JSON.stringify(events)).not.toContain(SENTINEL_KEY);
    });

    it.each<[string, ProviderConfig, () => Response]>([
        ["anthropic HTTP", anthropic, () => jsonResponse(500, { type: "error", error: { type: "t".repeat(5000), message: "m".repeat(5000) } })],
        ["anthropic mid-stream", anthropic, () => sseResponse(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "t".repeat(5000) } })}\n\n`)],
        ["openai HTTP", openai, () => jsonResponse(400, { error: { code: "c".repeat(5000), message: "m".repeat(5000) } })],
        ["openai mid-stream", openai, () => sseResponse(`data: ${JSON.stringify({ type: "error", code: "c".repeat(5000) })}\n\n`)],
        ["openai-compatible HTTP", compatible, () => jsonResponse(500, { error: { type: "t".repeat(5000) } })],
    ])("bounds the length of a provider's error label (%s)", async (_label, config, respond) => {
        const last = lastOf(await collect(provider(config, respond).provider));
        expect(last.type === "error" && last.message.length).toBeLessThan(700);
    });
});
