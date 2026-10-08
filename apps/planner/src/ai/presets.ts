/**
 * Provider presets (ADR-0023, spec R10): data, not logic. Each provider's
 * display name, suggested default model, a few suggestions, and help text.
 * Updating a default is a one-line change here; no task or adapter branches
 * on a model ID. The model field stays free text.
 */
import type { ProviderKind } from "@/lib/ai/types";

export interface ProviderPreset {
    kind: ProviderKind;
    name: string;
    /** "Send to …" */
    destination: string;
    defaultModel: string;
    modelSuggestions: readonly string[];
    /** Whether a key is required (a local server usually needs none). */
    needsKey: boolean;
    defaultBaseUrl: string;
    /** Where the coach creates and revokes a key, and sets a spend limit. Official pages only. */
    keyHelp: string;
    spendHelp: string;
    links: ReadonlyArray<{ label: string; href: string }>;
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
    anthropic: {
        kind: "anthropic",
        name: "Anthropic (Claude)",
        destination: "Anthropic",
        defaultModel: "claude-sonnet-5-5",
        modelSuggestions: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
        needsKey: true,
        defaultBaseUrl: "",
        keyHelp: "Create a key in the Claude Console. To stop using it, revoke it there.",
        spendHelp: "Consider a separate workspace for this key, with a monthly spend limit you choose.",
        links: [
            { label: "Workspaces and spend limits", href: "https://platform.claude.com/docs/en/manage-claude/workspaces" },
            { label: "Anthropic privacy policy", href: "https://www.anthropic.com/legal/privacy" },
        ],
    },
    openai: {
        kind: "openai",
        name: "OpenAI",
        destination: "OpenAI",
        defaultModel: "gpt-6-astra",
        modelSuggestions: ["gpt-6-astra", "gpt-6-luna", "gpt-6.1-sol"],
        needsKey: true,
        defaultBaseUrl: "",
        keyHelp: "Create a key in the OpenAI dashboard. To stop using it, revoke it there.",
        spendHelp: 'Consider a separate project for this key, with a monthly spend limit and "Enforce a hard limit" turned on.',
        links: [
            { label: "Project spend limits", href: "https://developers.openai.com/api/docs/guides/spend-limits" },
        ],
    },
    "openai-compatible": {
        kind: "openai-compatible",
        name: "A server on this computer (Ollama, LM Studio)",
        destination: "the server on this computer",
        defaultModel: "",
        modelSuggestions: ["qwen3:8b", "gpt-oss:20b"],
        needsKey: false,
        defaultBaseUrl: "http://localhost:11434/v1",
        keyHelp: "Most local servers need no key. Leave it empty unless yours asks for one.",
        spendHelp: "A server on this computer runs on your own hardware.",
        links: [
            { label: "Ollama: allowed origins (OLLAMA_ORIGINS)", href: "https://docs.ollama.com/faq" },
            { label: "LM Studio: lms server start --cors", href: "https://lmstudio.ai/docs/cli/server-start" },
        ],
    },
};

/** What a local server needs before the planner can reach it (spec R3). Shown in settings. */
export const LOCAL_SERVER_HELP = [
    'Ollama: set OLLAMA_ORIGINS to this page\'s origin (for example OLLAMA_ORIGINS=https://openleague.dev), then restart Ollama. Its address is usually http://localhost:11434/v1.',
    'LM Studio: turn on "Enable CORS" in the Developer tab\'s server settings, or start it with lms server start --cors. Its address is usually http://localhost:1234/v1.',
    "Your browser may ask to allow this page to reach devices on your local network. Allow it, or the request can't reach the server.",
] as const;
