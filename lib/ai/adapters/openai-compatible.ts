/**
 * OpenAI-compatible Chat Completions at a coach-supplied base URL, for local
 * servers such as Ollama and LM Studio (ADR-0023, spec R2/R3). Structured output
 * through response_format. The base URL must be on the origin allowlist
 * (loopback in the public build); Authorization is sent only when the coach
 * entered a key (Ruling 10).
 */
import { readSse } from "../sse";
import type { AiEvent, AiProvider, AiRequest, AiUsage } from "../types";
import { CUT_OFF_MESSAGE, NOT_ALLOWED_MESSAGE, aiError, failureEvent, mentionsSpendLimit, openStream, otherHttpError, parseJson, readErrorBody, type ProviderErrorBody } from "./shared";
import { isAllowedUrl } from "../origins";

export const INVALID_BASE_URL_MESSAGE = "Enter the server's address, such as http://localhost:11434/v1.";

/**
 * The chat completions URL for a base URL, or an error message. http(s) only;
 * no user info, query or fragment; trailing slashes dropped.
 */
export function chatCompletionsUrl(baseUrl: string, allowedOrigins: readonly string[]): { ok: true; url: string } | { ok: false; message: string } {
    let parsed: URL;
    try {
        parsed = new URL(baseUrl.trim());
    } catch {
        return { ok: false, message: INVALID_BASE_URL_MESSAGE };
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash) {
        return { ok: false, message: INVALID_BASE_URL_MESSAGE };
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    const url = `${parsed.origin}${path}/chat/completions`;
    if (!isAllowedUrl(url, allowedOrigins)) return { ok: false, message: NOT_ALLOWED_MESSAGE };
    return { ok: true, url };
}

export function classifyCompatible(status: number | null, body: ProviderErrorBody): AiEvent {
    if (status === 401 || status === 403) return aiError("auth");
    if (status === 402 || (status === 429 && mentionsSpendLimit(body))) return aiError("spend-limit");
    if (status === 429) return aiError("rate-limit");
    if (status === null) return aiError("other", "The server reported an error mid-reply. Try again.");
    return otherHttpError(status, body);
}

export function createOpenAiCompatibleProvider(
    apiKey: string,
    baseUrl: string,
    fetchImpl: typeof fetch,
    allowedOrigins: readonly string[],
): AiProvider {
    return {
        kind: "openai-compatible",
        async *send(request: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
            const target = chatCompletionsUrl(baseUrl, allowedOrigins);
            if (!target.ok) {
                yield aiError("other", target.message);
                return;
            }
            const opened = await openStream(
                {
                    url: target.url,
                    headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
                    body: {
                        model: request.model,
                        messages: [
                            { role: "system", content: request.system },
                            { role: "user", content: request.input },
                        ],
                        max_tokens: request.maxOutputTokens,
                        stream: true,
                        stream_options: { include_usage: true },
                        ...(request.output
                            ? { response_format: { type: "json_schema", json_schema: { name: request.output.name, schema: request.output.schema, strict: true } } }
                            : {}),
                    },
                },
                { fetchImpl, allowedOrigins, signal, apiKey, classify: classifyCompatible },
            );
            if (!opened.ok) {
                yield opened.event;
                return;
            }
            let text = "";
            let finish: string | null = null;
            let refusal = false;
            let usage: AiUsage | undefined;
            let finished = false;
            try {
                for await (const frame of readSse(opened.body)) {
                    if (frame.data.trim() === "[DONE]") {
                        finished = true;
                        break;
                    }
                    const data = parseJson(frame.data) as Record<string, unknown> | null;
                    if (!data) continue;
                    if (data.error) {
                        yield classifyCompatible(null, readErrorBody(data, apiKey));
                        return;
                    }
                    const raw = data.usage as Record<string, unknown> | undefined;
                    if (raw && typeof raw.prompt_tokens === "number" && typeof raw.completion_tokens === "number") {
                        usage = { inputTokens: raw.prompt_tokens, outputTokens: raw.completion_tokens };
                    }
                    const choice = (Array.isArray(data.choices) ? data.choices[0] : undefined) as Record<string, unknown> | undefined;
                    if (!choice) continue;
                    const delta = choice.delta as Record<string, unknown> | undefined;
                    if (typeof delta?.content === "string" && delta.content) {
                        text += delta.content;
                        yield { type: "text", delta: delta.content };
                    }
                    if (typeof delta?.refusal === "string" && delta.refusal) refusal = true;
                    if (typeof choice.finish_reason === "string") finish = choice.finish_reason;
                }
            } catch (error) {
                yield failureEvent(error, signal, target.url);
                return;
            }
            if (signal.aborted) {
                yield aiError("aborted");
                return;
            }
            if (refusal || finish === "content_filter") {
                yield aiError("refused");
                return;
            }
            if (finish === "length") {
                yield aiError("bad-output", CUT_OFF_MESSAGE);
                return;
            }
            if (!finished && finish === null) {
                yield aiError("cors", "The connection to the server closed before the reply finished. Check that it is still running, then try again.");
                return;
            }
            yield { type: "done", text, ...(usage ? { usage } : {}) };
        },
    };
}
