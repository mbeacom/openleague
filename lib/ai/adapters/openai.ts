/**
 * OpenAI Responses API, streamed, with structured output in text.format
 * (json_schema, strict) (ADR-0023, spec R2/R3). store: false, so the reply
 * isn't kept by the API (Ruling 9). The key goes only in Authorization, only
 * to https://api.openai.com.
 */
import { readSse } from "../sse";
import type { AiEvent, AiProvider, AiRequest, AiUsage } from "../types";
import { CUT_OFF_MESSAGE, aiError, failureEvent, mentionsSpendLimit, openStream, otherHttpError, parseJson, type ProviderErrorBody } from "./shared";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** OpenAI HTTP or stream error → our code (Ruling 7: 429 insufficient_quota is the spend limit). */
export function classifyOpenAi(status: number | null, body: ProviderErrorBody, apiKey: string): AiEvent {
    const code = body.code ?? body.type;
    if (status === 401 || status === 403 || code === "invalid_api_key") return aiError("auth");
    if (code === "insufficient_quota" || code === "billing_hard_limit_reached" || (status === 429 && mentionsSpendLimit(body))) return aiError("spend-limit");
    if (status === 429 || code === "rate_limit_exceeded") return aiError("rate-limit");
    if (status === null) return aiError("other", `The provider reported an error mid-reply (${code ?? "unknown"}). Try again.`);
    return otherHttpError(status, body, apiKey);
}

function errorFields(raw: unknown): ProviderErrorBody {
    const error = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" && value ? value : null);
    return { type: text(error.type), code: text(error.code), message: text(error.message) };
}

export function createOpenAiProvider(apiKey: string, fetchImpl: typeof fetch, allowedOrigins: readonly string[]): AiProvider {
    return {
        kind: "openai",
        async *send(request: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
            const opened = await openStream(
                {
                    url: OPENAI_RESPONSES_URL,
                    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
                    body: {
                        model: request.model,
                        instructions: request.system,
                        input: request.input,
                        max_output_tokens: request.maxOutputTokens,
                        stream: true,
                        store: false,
                        ...(request.output
                            ? { text: { format: { type: "json_schema", name: request.output.name, schema: request.output.schema, strict: true } } }
                            : {}),
                    },
                },
                { fetchImpl, allowedOrigins, signal, apiKey, classify: (status, body) => classifyOpenAi(status, body, apiKey) },
            );
            if (!opened.ok) {
                yield opened.event;
                return;
            }
            let text = "";
            let refusal = false;
            let usage: AiUsage | undefined;
            let finished = false;
            try {
                for await (const frame of readSse(opened.body)) {
                    const data = parseJson(frame.data) as Record<string, unknown> | null;
                    if (!data) continue;
                    const type = data.type ?? frame.event;
                    if (type === "response.output_text.delta" && typeof data.delta === "string" && data.delta) {
                        text += data.delta;
                        yield { type: "text", delta: data.delta };
                    } else if (type === "response.refusal.delta" || type === "response.refusal.done") {
                        refusal = true;
                    } else if (type === "response.completed") {
                        const raw = (data.response as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;
                        if (raw && typeof raw.input_tokens === "number" && typeof raw.output_tokens === "number") {
                            usage = { inputTokens: raw.input_tokens, outputTokens: raw.output_tokens };
                        }
                        finished = true;
                        break;
                    } else if (type === "response.incomplete") {
                        const reason = ((data.response as Record<string, unknown> | undefined)?.incomplete_details as Record<string, unknown> | undefined)?.reason;
                        yield reason === "content_filter" ? aiError("refused") : aiError("bad-output", CUT_OFF_MESSAGE);
                        return;
                    } else if (type === "response.failed") {
                        yield classifyOpenAi(null, errorFields((data.response as Record<string, unknown> | undefined)?.error), apiKey);
                        return;
                    } else if (type === "error") {
                        yield classifyOpenAi(null, errorFields(data.error ?? data), apiKey);
                        return;
                    }
                }
            } catch (error) {
                yield failureEvent(error, signal, OPENAI_RESPONSES_URL);
                return;
            }
            if (signal.aborted) {
                yield aiError("aborted");
                return;
            }
            if (refusal) {
                yield aiError("refused");
                return;
            }
            if (!finished) {
                yield aiError("network", "The connection closed before the reply finished. Try again.");
                return;
            }
            yield { type: "done", text, ...(usage ? { usage } : {}) };
        },
    };
}
