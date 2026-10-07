/**
 * The shared document envelope (storage connectors spec R1/R2; ADR-0022): one
 * wrapper — kind, version, id, updatedAt, generator — around an unchanged bare
 * document. Readers accept both the wrapped and the bare form, forever. Pure
 * and portable (ADR-0020).
 *
 * Phase 1 reads only: no surface writes the envelope yet. `wrapDocument` and
 * `serializeDocument` exist for the round trip and for the phase that does.
 */
import { z } from "zod";
import type { PlanGenerator } from "@/lib/plan-document/document";
import { DOCUMENT_KINDS, isDocumentKind, type DocumentKind, type DocumentKindEntry, type DocumentPayloads } from "./kinds";

export const DOCUMENT_ENVELOPE_FORMAT = "openleague.document" as const;
export const DOCUMENT_ENVELOPE_VERSION = 1 as const;
/** What the wrapper may add to a kind's size limit. */
export const ENVELOPE_OVERHEAD_BYTES = 4096;

export const NOT_A_DOCUMENT_MESSAGE = "This file isn't an OpenLeague file.";
export const NEWER_ENVELOPE_MESSAGE = "This file was made by a newer version of OpenLeague. Update to open it.";
export const UNKNOWN_KIND_MESSAGE = "This file needs a newer version of OpenLeague. Update to open it.";
export const INVALID_ENVELOPE_MESSAGE = "This file has problems and can't be opened.";
export const DOCUMENT_TOO_LARGE_MESSAGE = "This file is too large to be an OpenLeague file.";

const MAX_GENERATOR_LENGTH = 100;
const MAX_KIND_LENGTH = 100;

const isoDateTime = z.iso.datetime({ offset: true, message: "updatedAt must be an ISO date-time" });

/** Unknown keys are stripped, so an additive envelope field never needs a version bump. */
export const documentEnvelopeSchema = z.object({
    format: z.literal(DOCUMENT_ENVELOPE_FORMAT),
    envelope: z.literal(DOCUMENT_ENVELOPE_VERSION),
    kind: z.string({ message: "kind must be text" }).min(1, "kind is required").max(MAX_KIND_LENGTH),
    version: z.number({ message: "version must be a number" }).int("version must be a whole number").min(1, "version must be at least 1"),
    id: z.uuid({ message: "id must be a UUID" }),
    updatedAt: isoDateTime,
    generator: z.string({ message: "generator must be text" }).trim().min(1, "generator is required").max(MAX_GENERATOR_LENGTH),
    // The kind's own parser validates (and strips) the payload.
    payload: z.unknown(),
});

export type DocumentEnvelope = z.output<typeof documentEnvelopeSchema>;
export type DocumentGenerator = PlanGenerator;

/** What the caller knows about where the text came from. */
export interface DocumentSource {
    /** The storage's modified time (a connector's file time, or a picked file's lastModified), ISO. */
    modifiedAt?: string;
}

export type DocumentErrorCode =
    | "not-a-document"
    | "wrong-kind"
    | "too-large"
    | "newer-envelope"
    | "unknown-kind"
    | "newer-version"
    | "invalid";

export interface DocumentError {
    code: DocumentErrorCode;
    message: string;
    /** For "invalid": one readable line per problem */
    issues?: string[];
}

/** A document read from either form. `id` is null for a bare document; `updatedAt` is null when unknown. */
export type ReadDocument<K extends DocumentKind = DocumentKind> = {
    [P in K]: { kind: P; version: number; payload: DocumentPayloads[P]; id: string | null; updatedAt: string | null; wrapped: boolean };
}[K];

export type ReadDocumentResult<K extends DocumentKind = DocumentKind> = { ok: true; document: ReadDocument<K> } | { ok: false; error: DocumentError };

export interface ExpectKind<K extends DocumentKind> {
    kind: K;
}

const fail = (code: DocumentErrorCode, message: string, issues?: string[]): { ok: false; error: DocumentError } => ({
    ok: false,
    error: { code, message, ...(issues ? { issues } : {}) },
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const entryOf = (kind: DocumentKind): DocumentKindEntry<DocumentKind> => DOCUMENT_KINDS[kind] as DocumentKindEntry<DocumentKind>;

const sourceTime = (source: DocumentSource | undefined): string | null =>
    source?.modifiedAt !== undefined && isoDateTime.safeParse(source.modifiedAt).success ? source.modifiedAt : null;

/** Hands the payload to its kind's parser and assembles the result. */
function parseKind(kind: DocumentKind, payload: unknown, meta: { id: string | null; updatedAt: string | null } | null, source: DocumentSource | undefined): ReadDocumentResult {
    const entry = entryOf(kind);
    const parsed = entry.parse(payload);
    if (!parsed.ok) return fail(parsed.error.code, parsed.error.message, parsed.error.issues);
    const version = (parsed.payload as { version: number }).version;
    // Bare: the kind's own time, then the storage's, else unknown (spec R2).
    const updatedAt = meta ? meta.updatedAt : entry.updatedAtOf?.(parsed.payload) ?? sourceTime(source);
    return { ok: true, document: { kind, version, payload: parsed.payload, id: meta?.id ?? null, updatedAt, wrapped: meta !== null } as ReadDocument };
}

function readWrapped(raw: Record<string, unknown>, source: DocumentSource | undefined, expected: DocumentKind | undefined): ReadDocumentResult {
    // A newer envelope is refused before its fields, so it never reports field noise.
    const envelopeVersion = raw.envelope;
    if (typeof envelopeVersion === "number" && Number.isInteger(envelopeVersion) && envelopeVersion > DOCUMENT_ENVELOPE_VERSION) {
        return fail("newer-envelope", NEWER_ENVELOPE_MESSAGE);
    }
    const result = documentEnvelopeSchema.safeParse(raw);
    if (!result.success) {
        return fail("invalid", INVALID_ENVELOPE_MESSAGE, result.error.issues.map((issue) => issue.message));
    }
    const envelope = result.data;
    if (!isDocumentKind(envelope.kind)) return fail("unknown-kind", UNKNOWN_KIND_MESSAGE);
    if (expected !== undefined && envelope.kind !== expected) return fail("wrong-kind", entryOf(expected).notThisKindMessage);
    const payload = envelope.payload;
    if (!isRecord(payload) || payload.format !== envelope.kind || payload.version !== envelope.version) {
        return fail("invalid", INVALID_ENVELOPE_MESSAGE, ["The file's kind and version don't match its contents"]);
    }
    return parseKind(envelope.kind, payload, { id: envelope.id, updatedAt: envelope.updatedAt }, source);
}

/**
 * Reads a parsed JSON value in either form (spec R2): an envelope, or a bare
 * document of a known kind. Applies no size limit (see readDocumentText). With
 * `expect`, anything that isn't that kind gets that kind's own message.
 */
export function readDocument(raw: unknown, source?: DocumentSource): ReadDocumentResult;
export function readDocument<K extends DocumentKind>(raw: unknown, source: DocumentSource | undefined, expect: ExpectKind<K>): ReadDocumentResult<K>;
export function readDocument(raw: unknown, source?: DocumentSource, expect?: ExpectKind<DocumentKind>): ReadDocumentResult {
    const expected = expect?.kind;
    const notADocument = () => fail("not-a-document", expected ? entryOf(expected).notThisKindMessage : NOT_A_DOCUMENT_MESSAGE);
    if (!isRecord(raw)) return notADocument();
    if (raw.format === DOCUMENT_ENVELOPE_FORMAT) return readWrapped(raw, source, expected);
    if (!isDocumentKind(raw.format)) return notADocument();
    if (expected !== undefined && raw.format !== expected) return fail("wrong-kind", entryOf(expected).notThisKindMessage);
    return parseKind(raw.format, raw, null, source);
}

const LARGEST_KIND_BYTES = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes));

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/**
 * Reads text in either form, with the size rules (spec R2): a bare document is
 * held to its kind's limit, a wrapped one to that limit plus
 * ENVELOPE_OVERHEAD_BYTES. Text that isn't a wrapped document of a known kind
 * is held to the plain limit (the expected kind's, else the largest), and text
 * over that limit plus the overhead is refused before it is parsed.
 */
export function readDocumentText(text: string, source?: DocumentSource): ReadDocumentResult;
export function readDocumentText<K extends DocumentKind>(text: string, source: DocumentSource | undefined, expect: ExpectKind<K>): ReadDocumentResult<K>;
export function readDocumentText(text: string, source?: DocumentSource, expect?: ExpectKind<DocumentKind>): ReadDocumentResult {
    const expectedEntry = expect ? entryOf(expect.kind) : null;
    const limit = expectedEntry?.maxBytes ?? LARGEST_KIND_BYTES;
    const tooLargeMessage = expectedEntry?.tooLargeMessage ?? DOCUMENT_TOO_LARGE_MESSAGE;
    const size = byteLength(text);
    if (size > limit + ENVELOPE_OVERHEAD_BYTES) return fail("too-large", tooLargeMessage);

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        if (size > limit) return fail("too-large", tooLargeMessage);
        return fail("not-a-document", expectedEntry?.notThisKindMessage ?? NOT_A_DOCUMENT_MESSAGE);
    }

    const wrapped = isRecord(raw) && raw.format === DOCUMENT_ENVELOPE_FORMAT;
    const kind = isRecord(raw) ? (wrapped ? raw.kind : raw.format) : undefined;
    if (isDocumentKind(kind)) {
        // Another known kind than the one expected is refused as that by readDocument.
        const entry = entryOf(kind);
        const kindLimit = wrapped ? entry.maxBytes + ENVELOPE_OVERHEAD_BYTES : entry.maxBytes;
        if ((!expect || kind === expect.kind) && size > kindLimit) return fail("too-large", entry.tooLargeMessage);
    } else if (!wrapped && size > limit) {
        return fail("too-large", tooLargeMessage);
    }
    return expect ? readDocument(raw, source, expect) : readDocument(raw, source);
}

/** Wraps a bare document. The caller supplies the id (made once, kept for the document's life) and the save time. */
export function wrapDocument<K extends DocumentKind>(
    kind: K,
    payload: DocumentPayloads[K],
    meta: { id: string; updatedAt: string; generator: DocumentGenerator },
): DocumentEnvelope {
    return {
        format: DOCUMENT_ENVELOPE_FORMAT,
        envelope: DOCUMENT_ENVELOPE_VERSION,
        kind,
        version: payload.version,
        id: meta.id,
        updatedAt: meta.updatedAt,
        generator: meta.generator,
        payload,
    };
}

export function serializeDocument(envelope: DocumentEnvelope): string {
    return `${JSON.stringify(envelope, null, 2)}\n`;
}
