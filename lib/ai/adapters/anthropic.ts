/**
 * Anthropic Messages API, streamed, with structured output in
 * output_config.format (ADR-0023, spec R2/R3). The key goes only in x-api-key,
 * only to https://api.anthropic.com.
 */
import { readSse } from "../sse";
import type { AiEvent, AiProvider, AiRequest, AiUsage } from "../types";
import { CUT_OFF_MESSAGE, aiError, failureEvent, mentionsSpendLimit, openStream, otherHttpError, parseJson, type ProviderErrorBody } from "./shared";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Anthropic HTTP or stream error → our code (Ruling 7: a spend limit is a 400 or 429 naming it, or a 402). */
export function classifyAnthropic(status: number | null, body: ProviderErrorBody, apiKey: string): AiEvent {
    const type = body.type;
    if (status === 401 || status === 403 || type === "authentication_error" || type === "permission_error") return aiError("auth");
    if (status === 402 || type === "billing_error") return aiError("spend-limit");
    if ((status === 400 || status === 429 || type === "invalid_request_error" || type === "rate_limit_error") && mentionsSpendLimit(body)) {
        return aiError("spend-limit");
    }
    if (status === 429 || type === "rate_limit_error") return aiError("rate-limit");
    if (status === null) return aiError("other", `The provider reported an error mid-reply (${type ?? "unknown"}). Try again.`);
    return otherHttpError(status, body, apiKey);
}

export function createAnthropicProvider(apiKey: string, fetchImpl: typeof fetch, allowedOrigins: readonly string[]): AiProvider {
    return {
        kind: "anthropic",
        async *send(request: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
            const opened = await openStream(
                {
                    url: ANTHROPIC_MESSAGES_URL,
                    headers: {
                        "content-type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": ANTHROPIC_VERSION,
                        "anthropic-dangerous-direct-browser-access": "true",
                    },
                    body: {
                        model: request.model,
                        max_tokens: request.maxOutputTokens,
                        system: request.system,
                        messages: [{ role: "user", content: request.input }],
                        stream: true,
                        ...(request.output ? { output_config: { format: { type: "json_schema", schema: request.output.schema } } } : {}),
                    },
                },
                { fetchImpl, allowedOrigins, signal, apiKey, classify: (status, body) => classifyAnthropic(status, body, apiKey) },
            );
            if (!opened.ok) {
                yield opened.event;
                return;
            }
            let text = "";
            const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
            let stopReason: string | null = null;
            let stopped = false;
            try {
                for await (const frame of readSse(opened.body)) {
                    const data = parseJson(frame.data) as Record<string, unknown> | null;
                    if (!data) continue;
                    const type = data.type ?? frame.event;
                    if (type === "message_start") {
                        const input = ((data.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined)?.input_tokens;
                        if (typeof input === "number") usage.inputTokens = input;
                    } else if (type === "content_block_delta") {
                        const delta = data.delta as Record<string, unknown> | undefined;
                        if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text) {
                            text += delta.text;
                            yield { type: "text", delta: delta.text };
                        }
                    } else if (type === "message_delta") {
                        const reason = (data.delta as Record<string, unknown> | undefined)?.stop_reason;
                        if (typeof reason === "string") stopReason = reason;
                        const output = (data.usage as Record<string, unknown> | undefined)?.output_tokens;
                        if (typeof output === "number") usage.outputTokens = output;
                    } else if (type === "error") {
                        const error = (data.error ?? {}) as Record<string, unknown>;
                        yield classifyAnthropic(null, { type: typeof error.type === "string" ? error.type : null, code: null, message: typeof error.message === "string" ? error.message : null }, apiKey);
                        return;
                    } else if (type === "message_stop") {
                        stopped = true;
                        break;
                    }
                }
            } catch (error) {
                yield failureEvent(error, signal, ANTHROPIC_MESSAGES_URL);
                return;
            }
            if (signal.aborted) {
                yield aiError("aborted");
                return;
            }
            if (stopReason === "refusal") {
                yield aiError("refused");
                return;
            }
            if (stopReason === "max_tokens") {
                yield aiError("bad-output", CUT_OFF_MESSAGE);
                return;
            }
            if (!stopped) {
                yield aiError("network", "The connection closed before the reply finished. Try again.");
                return;
            }
            yield { type: "done", text, usage };
        },
    };
}
