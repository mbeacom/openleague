/** One factory for the three adapters (ADR-0023, spec R2). Tasks never see which vendor they talk to. */
import { createAnthropicProvider } from "./adapters/anthropic";
import { createOpenAiProvider } from "./adapters/openai";
import { createOpenAiCompatibleProvider } from "./adapters/openai-compatible";
import type { AiProvider, ProviderConfig, ProviderDeps } from "./types";

export function createProvider(config: ProviderConfig, deps: ProviderDeps): AiProvider {
    // Bound so a browser's fetch keeps its `this`.
    const fetchImpl = deps.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    switch (config.kind) {
        case "anthropic":
            return createAnthropicProvider(config.apiKey, fetchImpl, deps.allowedOrigins);
        case "openai":
            return createOpenAiProvider(config.apiKey, fetchImpl, deps.allowedOrigins);
        case "openai-compatible":
            return createOpenAiCompatibleProvider(config.apiKey, config.baseUrl ?? "", fetchImpl, deps.allowedOrigins);
    }
}
