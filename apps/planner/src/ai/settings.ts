/**
 * AI settings (ADR-0023, spec R5, Ruling 12): everything except the key, which
 * is never stored (key-holder.ts). Kept in the meta store under one key,
 * validated on write and read leniently, so a damaged record reads as "off".
 * Only the fields below are ever written: an extra field such as a key is dropped.
 */
import { PROVIDER_KINDS, type ProviderKind } from "@/lib/ai/types";
import { PROVIDER_PRESETS } from "./presets";

export interface ProviderSettings {
    model: string;
    /** For openai-compatible: the server's base URL. "" for the others. */
    baseUrl: string;
    /** The destination the coach acknowledged the disclosure for (acknowledgementFor), or null. */
    acknowledged: string | null;
}

export interface AiSettings {
    enabled: boolean;
    active: ProviderKind | null;
    providers: Record<ProviderKind, ProviderSettings>;
}

const MAX_FIELD = 200;

export function defaultProviderSettings(kind: ProviderKind): ProviderSettings {
    const preset = PROVIDER_PRESETS[kind];
    return { model: preset.defaultModel, baseUrl: preset.defaultBaseUrl, acknowledged: null };
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
    enabled: false,
    active: null,
    providers: {
        anthropic: defaultProviderSettings("anthropic"),
        openai: defaultProviderSettings("openai"),
        "openai-compatible": defaultProviderSettings("openai-compatible"),
    },
};

export function isProviderKind(value: unknown): value is ProviderKind {
    return (PROVIDER_KINDS as readonly unknown[]).includes(value);
}

const text = (value: unknown, fallback: string) => (typeof value === "string" ? value.slice(0, MAX_FIELD) : fallback);

function readProvider(kind: ProviderKind, raw: unknown): ProviderSettings {
    const fallback = defaultProviderSettings(kind);
    if (!raw || typeof raw !== "object") return fallback;
    const record = raw as Record<string, unknown>;
    return {
        model: text(record.model, fallback.model),
        baseUrl: kind === "openai-compatible" ? text(record.baseUrl, fallback.baseUrl) : "",
        acknowledged: typeof record.acknowledged === "string" ? record.acknowledged.slice(0, MAX_FIELD * 2) : null,
    };
}

/** A stored record, read leniently: anything unreadable is the default. Picks known fields only. */
export function readAiSettings(raw: unknown): AiSettings {
    if (!raw || typeof raw !== "object") return DEFAULT_AI_SETTINGS;
    const record = raw as Record<string, unknown>;
    const providers = (record.providers && typeof record.providers === "object" ? record.providers : {}) as Record<string, unknown>;
    return {
        enabled: record.enabled === true,
        active: isProviderKind(record.active) ? record.active : null,
        providers: {
            anthropic: readProvider("anthropic", providers.anthropic),
            openai: readProvider("openai", providers.openai),
            "openai-compatible": readProvider("openai-compatible", providers["openai-compatible"]),
        },
    };
}

/** The record as written: the same field picking as a read, so nothing else (never a key) reaches storage. */
export const toStoredAiSettings = readAiSettings;

/** What the disclosure was shown for: the provider, and for a local server its base URL. A change shows it again. */
export function acknowledgementFor(kind: ProviderKind, baseUrl: string): string {
    return kind === "openai-compatible" ? `${kind} ${baseUrl.trim().replace(/\/+$/, "")}` : kind;
}

export function isAcknowledged(settings: AiSettings, kind: ProviderKind): boolean {
    const provider = settings.providers[kind];
    return provider.acknowledged === acknowledgementFor(kind, provider.baseUrl);
}
