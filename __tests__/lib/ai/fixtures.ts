/**
 * Hand-written provider fixtures in each vendor's documented format (no
 * recorded traffic, never a real key) and a recording fetch stub. Nothing
 * here reaches the network.
 */
import { vi } from "vitest";

export const SENTINEL_KEY = "sk-sentinel-KEY-0123456789abcdef";

export function streamOf(chunks: ReadonlyArray<string | Uint8Array>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
            controller.close();
        },
    });
}

/** An SSE response whose body arrives in chunks of `size` characters, so frames split across reads. */
export function sseResponse(text: string, size = 7): Response {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return new Response(streamOf(chunks), { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export interface RecordedCall {
    url: string;
    init: RequestInit & { targetAddressSpace?: string };
    headers: Record<string, string>;
    body: Record<string, unknown>;
}

/** A fetch stub that records every call and answers with `respond`. */
export function recordingFetch(respond: (call: RecordedCall) => Response | Promise<Response>) {
    const calls: RecordedCall[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        const call: RecordedCall = { url, init: (init ?? {}) as RecordedCall["init"], headers, body };
        calls.push(call);
        return respond(call);
    });
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const sse = (event: string | null, data: unknown) => `${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;

/** A draft the fixtures stream, split in two text deltas. */
export const DRAFT_JSON = '{"title":"Riverside 9U Tuesday","ok":true}';
const [PART_A, PART_B] = [DRAFT_JSON.slice(0, 15), DRAFT_JSON.slice(15)];

export const ANTHROPIC_STREAM =
    sse("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], usage: { input_tokens: 120, output_tokens: 1 } } }) +
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
    sse("ping", { type: "ping" }) +
    sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: PART_A } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: PART_B } }) +
    sse("content_block_stop", { type: "content_block_stop", index: 0 }) +
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } }) +
    sse("message_stop", { type: "message_stop" });

export const anthropicStop = (reason: string) =>
    sse("message_start", { type: "message_start", message: { usage: { input_tokens: 5 } } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{" } }) +
    sse("message_delta", { type: "message_delta", delta: { stop_reason: reason }, usage: { output_tokens: 3 } }) +
    sse("message_stop", { type: "message_stop" });

export const ANTHROPIC_STREAM_ERROR =
    sse("message_start", { type: "message_start", message: { usage: { input_tokens: 5 } } }) +
    sse("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });

export const OPENAI_STREAM =
    sse("response.created", { type: "response.created", response: { id: "resp_1", status: "in_progress" }, sequence_number: 0 }) +
    sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: PART_A, sequence_number: 1 }) +
    sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: PART_B, sequence_number: 2 }) +
    sse("response.output_text.done", { type: "response.output_text.done", text: DRAFT_JSON, sequence_number: 3 }) +
    sse("response.completed", { type: "response.completed", response: { id: "resp_1", status: "completed", usage: { input_tokens: 120, output_tokens: 42, total_tokens: 162 } }, sequence_number: 4 });

export const OPENAI_REFUSAL =
    sse("response.refusal.delta", { type: "response.refusal.delta", delta: "I can't help with that.", sequence_number: 1 }) +
    sse("response.completed", { type: "response.completed", response: { status: "completed", usage: { input_tokens: 5, output_tokens: 5 } }, sequence_number: 2 });

export const OPENAI_INCOMPLETE = sse("response.incomplete", {
    type: "response.incomplete",
    response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
    sequence_number: 1,
});

export const OPENAI_STREAM_ERROR = sse("error", { type: "error", code: "rate_limit_exceeded", message: "Slow down", sequence_number: 1 });

export const COMPATIBLE_STREAM =
    sse(null, { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }) +
    sse(null, { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: PART_A }, finish_reason: null }] }) +
    sse(null, { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: PART_B }, finish_reason: null }] }) +
    sse(null, { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
    sse(null, { id: "c1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 120, completion_tokens: 42, total_tokens: 162 } }) +
    "data: [DONE]\n\n";

export const COMPATIBLE_LENGTH =
    sse(null, { choices: [{ index: 0, delta: { content: "{" }, finish_reason: null }] }) +
    sse(null, { choices: [{ index: 0, delta: {}, finish_reason: "length" }] }) +
    "data: [DONE]\n\n";

export const ERROR_BODIES = {
    anthropicAuth: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" }, request_id: "req_1" },
    anthropicRate: { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } },
    anthropicSpend: { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified workspace API usage limits; your spend limit resets next month." } },
    anthropicCredit: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
    anthropicBadModel: { type: "error", error: { type: "not_found_error", message: "model: not-a-model" } },
    openaiAuth: { error: { message: `Incorrect API key provided: ${SENTINEL_KEY}.`, type: "invalid_request_error", param: null, code: "invalid_api_key" } },
    openaiRate: { error: { message: "Rate limit reached", type: "requests", param: null, code: "rate_limit_exceeded" } },
    openaiQuota: { error: { message: "You exceeded your current quota.", type: "insufficient_quota", param: null, code: "insufficient_quota" } },
    openaiBadModel: { error: { message: `The model \`gpt-x\` does not exist. Key ${SENTINEL_KEY} was used.`, type: "invalid_request_error", param: null, code: "model_not_found" } },
};

/**
 * Provider error fields that reflect the key: a type, code and message that
 * each carry it, joined to other text so only the key-holder's own value
 * (not the generic token mask) can catch it.
 */
export const REFLECTED_ERROR = { type: `err${SENTINEL_KEY}`, code: `code${SENTINEL_KEY}`, message: `Bad request from ${SENTINEL_KEY}` };

/** A mid-stream error frame in each vendor's format, carrying the reflected fields. */
export const REFLECTED_STREAM_ERRORS = {
    anthropic:
        sse("message_start", { type: "message_start", message: { usage: { input_tokens: 5 } } }) +
        sse("error", { type: "error", error: REFLECTED_ERROR }),
    openaiError: sse("error", { type: "error", code: REFLECTED_ERROR.code, message: REFLECTED_ERROR.message, sequence_number: 1 }),
    openaiErrorType: sse("error", { type: "error", error: { type: REFLECTED_ERROR.type, message: REFLECTED_ERROR.message }, sequence_number: 1 }),
    openaiFailed: sse("response.failed", { type: "response.failed", response: { status: "failed", error: REFLECTED_ERROR }, sequence_number: 1 }),
    compatible: sse(null, { error: REFLECTED_ERROR }),
};
