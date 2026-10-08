/**
 * The registry of document kinds the envelope can carry (storage connectors
 * spec R2; ADR-0022). Each entry adapts a kind's existing parser, which keeps
 * its own messages. Imports each kind's document module directly (never its
 * index), because the kinds' file readers import the envelope.
 */
import {
    FILE_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    parsePlan,
    type PlanDocument,
} from "@/lib/plan-document/document";
import {
    MAX_RANKINGS_FILE_BYTES,
    NOT_RANKINGS_MESSAGE,
    RANKINGS_FILE_TOO_LARGE_MESSAGE,
    RANKINGS_FORMAT,
    parseRankings,
    type RankingsDocument,
} from "@/lib/rankings-document/document";

/** Each known kind's `format`, mapped to its parsed document. */
export interface DocumentPayloads {
    "openleague.practice-plan": PlanDocument;
    "openleague.rankings": RankingsDocument;
}

export type DocumentKind = keyof DocumentPayloads;

export interface KindError {
    code: "newer-version" | "invalid";
    message: string;
    issues?: string[];
}

export type KindParseResult<K extends DocumentKind> = { ok: true; payload: DocumentPayloads[K] } | { ok: false; error: KindError };

export interface DocumentKindEntry<K extends DocumentKind> {
    kind: K;
    /** The bare document's limit; a wrapped one may add ENVELOPE_OVERHEAD_BYTES. */
    maxBytes: number;
    /** Shown when a reader expecting this kind gets anything else. */
    notThisKindMessage: string;
    tooLargeMessage: string;
    /** The kind's own parser: format, then its newer-version refusal, then its schema. */
    parse(raw: unknown): KindParseResult<K>;
    /** The kind's own "last saved" time, used for bare documents only. */
    updatedAtOf?(payload: DocumentPayloads[K]): string | null;
}

/** A kind parser's errors keep their message; any other code (unreachable once the format matched) is "invalid". */
function kindError(error: { code: string; message: string; issues?: string[] }): KindError {
    return {
        code: error.code === "newer-version" ? "newer-version" : "invalid",
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
    };
}

export const DOCUMENT_KINDS: { readonly [K in DocumentKind]: DocumentKindEntry<K> } = {
    [PLAN_FORMAT]: {
        kind: PLAN_FORMAT,
        maxBytes: MAX_PLAN_FILE_BYTES,
        notThisKindMessage: NOT_A_PLAN_MESSAGE,
        tooLargeMessage: FILE_TOO_LARGE_MESSAGE,
        parse: (raw) => {
            const result = parsePlan(raw);
            return result.ok ? { ok: true, payload: result.plan } : { ok: false, error: kindError(result.error) };
        },
        updatedAtOf: (plan) => plan.exportedAt,
    },
    [RANKINGS_FORMAT]: {
        kind: RANKINGS_FORMAT,
        maxBytes: MAX_RANKINGS_FILE_BYTES,
        notThisKindMessage: NOT_RANKINGS_MESSAGE,
        tooLargeMessage: RANKINGS_FILE_TOO_LARGE_MESSAGE,
        parse: (raw) => {
            const result = parseRankings(raw);
            return result.ok ? { ok: true, payload: result.doc } : { ok: false, error: kindError(result.error) };
        },
    },
};

export function isDocumentKind(value: unknown): value is DocumentKind {
    return typeof value === "string" && Object.hasOwn(DOCUMENT_KINDS, value);
}
