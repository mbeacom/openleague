/**
 * Encoders and decoders for the non-JSON formats. Each library loads through
 * import() inside the call, never at module load, so none reaches the static
 * planner's entry chunk (scripts/check-planner-build.ts) or the hosted page's
 * first load. Pure and portable (ADR-0020).
 */
import { DOCUMENT_FORMAT_INFO, type DocumentFormat } from "./formats";

/** The lazy library loaders. An object, so a test can see whether one ran. */
export const formatLoaders = {
    yaml: () => import("yaml"),
    toml: () => import("smol-toml"),
    jsonc: () => import("jsonc-parser"),
};

/** YAML anchors (&) and aliases (*) a file may resolve; caps "billion laughs" expansion. */
export const MAX_YAML_ALIASES = 100;

export const yamlMalformedMessage = (line: number | null) =>
    line === null ? "This YAML file has a typing mistake and can't be opened." : `This YAML file has a typing mistake on line ${line} and can't be opened.`;
export const tomlMalformedMessage = (line: number | null) =>
    line === null ? "This TOML file has a typing mistake and can't be opened." : `This TOML file has a typing mistake on line ${line} and can't be opened.`;
export const jsoncMalformedMessage = (line: number | null) =>
    line === null ? "This JSONC file has a typing mistake and can't be opened." : `This JSONC file has a typing mistake on line ${line} and can't be opened.`;
export const YAML_TOO_MANY_ALIASES_MESSAGE = "This YAML file repeats itself (with * aliases) too much to open safely.";
export const YAML_UNSUPPORTED_MESSAGE = "This YAML file uses tags (!) or other features OpenLeague doesn't read.";
export const FORMAT_LOAD_FAILED_MESSAGE = "Couldn't load the reader for this file type. Check your connection and try again.";
export const TOML_CANNOT_HOLD_MESSAGE = "This file has empty values TOML can't keep, so it can't be saved as TOML. Download it as JSON instead.";

export type DecodeResult = { ok: true; value: unknown } | { ok: false; message: string };

/** The library didn't load: offline, or a redeploy replaced its chunk. */
export class FormatModuleLoadError extends Error {
    constructor(format: DocumentFormat, cause: unknown) {
        super(`The ${DOCUMENT_FORMAT_INFO[format].label} library couldn't be loaded`, { cause });
        this.name = "FormatModuleLoadError";
    }
}

/** The document can't be written in this format (TOML has no null outside the schema's optional fields). */
export class DocumentEncodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DocumentEncodeError";
    }
}

async function load<K extends keyof typeof formatLoaders>(format: K): Promise<Awaited<ReturnType<(typeof formatLoaders)[K]>>> {
    try {
        return (await formatLoaders[format]()) as Awaited<ReturnType<(typeof formatLoaders)[K]>>;
    } catch (error) {
        throw new FormatModuleLoadError(format, error);
    }
}

const lineAt = (text: string, offset: number): number => text.slice(0, Math.max(0, offset)).split("\n").length;

// ---------------------------------------------------------------------------
// Headers: the kind, its version and how to open it. Never a name or any data.
// ---------------------------------------------------------------------------

const KIND_HEADERS: Record<string, { noun: string; open: string }> = {
    "openleague.practice-plan": {
        noun: "OpenLeague practice plan",
        open: "To open it, choose Import plan in the OpenLeague practice planner (openleague.dev/planner).",
    },
    "openleague.rankings": {
        noun: "OpenLeague rankings file",
        open: "To open it, choose Open rankings file under Rankings in the OpenLeague planner (openleague.dev/planner).",
    },
};

/** The kind and version, read from a bare document or an envelope. */
function kindOf(doc: unknown): { kind: string; version: number } | null {
    if (typeof doc !== "object" || doc === null) return null;
    const raw = doc as { format?: unknown; kind?: unknown; version?: unknown };
    const kind = raw.format === "openleague.document" ? raw.kind : raw.format;
    return typeof kind === "string" && typeof raw.version === "number" ? { kind, version: raw.version } : null;
}

/** Header lines, without a comment marker. */
export function headerLines(doc: unknown, format: DocumentFormat): string[] {
    const found = kindOf(doc);
    const header = found ? KIND_HEADERS[found.kind] : undefined;
    const lines = header
        ? [`${header.noun} (${found!.kind}, version ${found!.version}), saved as ${DOCUMENT_FORMAT_INFO[format].label}.`, header.open]
        : ["OpenLeague file.", "To open it, use the OpenLeague planner (openleague.dev/planner)."];
    if (format === "jsonc") lines.push("JSON with comments: lines starting with // are notes and are ignored.");
    return lines;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Where each kind's schema reads a missing value exactly as it reads null, so
 * TOML (which has no null) may leave the key out. Dotted paths; `*` is any
 * list index. A null anywhere else, such as inside data a kind keeps as-is
 * (rankings snapshots, drill diagrams), would be lost, so it refuses the export.
 */
export const TOML_OMITTABLE_NULLS: Readonly<Record<string, readonly string[]>> = {
    "openleague.practice-plan": [
        "session.date",
        "session.startTime",
        "session.goaliesAttending",
        "session.staff",
        "session.equipment",
        "session.roster",
        "session.roster.ageGroup",
        "session.roster.players.*.name",
        "session.roster.players.*.number",
        "session.drills.*.instructions",
        "session.drills.*.runsWithPrevious",
        "session.drills.*.rotateEveryMinutes",
        "session.drills.*.label",
        "session.drills.*.staff",
        "session.drills.*.drill.description",
        "session.drills.*.drill.ageGroups",
        "session.drills.*.drill.playData.equipmentNeeds",
    ],
    "openleague.rankings": [
        "meta.ageGroup",
        "meta.seasonLabel",
        "meta.source",
        "teams.*.startingBracket",
        "games.*.time",
        "games.*.homeGoals",
        "games.*.awayGoals",
        "games.*.rink",
        "myTeam",
        "sources.schedule.lastReadAt",
        "sources.snakeChart.lastReadAt",
    ],
};

/** The paths a document's nulls may be left out at: its kind's, under `payload.` when wrapped; none for an unknown kind. */
function omittableNullPaths(doc: unknown): ReadonlySet<string> {
    const found = kindOf(doc);
    const paths = found ? TOML_OMITTABLE_NULLS[found.kind] : undefined;
    if (!paths) return new Set();
    const wrapped = (doc as { format?: unknown }).format === "openleague.document";
    return new Set(wrapped ? paths.map((path) => `payload.${path}`) : paths);
}

/**
 * The document without the nulls TOML can't write. A null at a path in
 * `omittable` is left out (the kind's schema reads it back as null); any other
 * null, including one inside a list, has no TOML form and the document can't
 * be written. Undefined is dropped as JSON does.
 */
export function stripNullsForToml(value: unknown, omittable: ReadonlySet<string> = omittableNullPaths(value)): unknown {
    const walk = (node: unknown, path: string): unknown => {
        if (Array.isArray(node)) {
            const itemPath = path === "" ? "*" : `${path}.*`;
            return node.map((item) => {
                if (item === null || item === undefined) throw new DocumentEncodeError(TOML_CANNOT_HOLD_MESSAGE);
                return walk(item, itemPath);
            });
        }
        if (typeof node === "object" && node !== null) {
            const out: Record<string, unknown> = {};
            for (const [key, item] of Object.entries(node)) {
                const keyPath = path === "" ? key : `${path}.${key}`;
                if (item === undefined) continue;
                if (item === null) {
                    if (omittable.has(keyPath)) continue;
                    throw new DocumentEncodeError(TOML_CANNOT_HOLD_MESSAGE);
                }
                out[key] = walk(item, keyPath);
            }
            return out;
        }
        return node;
    };
    return walk(value, "");
}

/** The document as file text in `format`. JSON is exactly what the plain export writes. */
export async function encodeDocument(doc: object, format: DocumentFormat): Promise<string> {
    // Plain data first: what JSON would carry (no undefined, no class instances).
    const data = JSON.parse(JSON.stringify(doc)) as object;
    const json = `${JSON.stringify(data, null, 2)}\n`;
    switch (format) {
        case "json":
            return json;
        case "jsonc":
            return `${headerLines(data, format).map((line) => `// ${line}`).join("\n")}\n${json}`;
        case "yaml": {
            const { stringify } = await load("yaml");
            // No anchors for repeated objects, no folding of long text.
            const body = stringify(data, { version: "1.2", schema: "core", aliasDuplicateObjects: false, lineWidth: 0 });
            return `${headerLines(data, format).map((line) => `# ${line}`).join("\n")}\n${body}`;
        }
        case "toml": {
            const stripped = stripNullsForToml(data) as Record<string, unknown>;
            const { stringify } = await load("toml");
            return `${headerLines(data, format).map((line) => `# ${line}`).join("\n")}\n${stringify(stripped)}\n`;
        }
    }
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

async function decodeYaml(text: string): Promise<DecodeResult> {
    const { parseDocument } = await load("yaml");
    // Core schema only: no custom or language tags, no timestamps (dates stay text),
    // no `<<` merge keys, and duplicate keys are errors.
    // resolveKnownTags: false keeps out YAML 1.1 extras (!!binary, !!timestamp, !!set…).
    const document = parseDocument(text, {
        version: "1.2",
        schema: "core",
        merge: false,
        uniqueKeys: true,
        customTags: [],
        resolveKnownTags: false,
        logLevel: "silent",
        prettyErrors: false,
    });
    const error = document.errors[0];
    if (error) return { ok: false, message: yamlMalformedMessage(lineAt(text, error.pos[0])) };
    if (document.warnings.length > 0) return { ok: false, message: YAML_UNSUPPORTED_MESSAGE };
    try {
        return { ok: true, value: document.toJS({ maxAliasCount: MAX_YAML_ALIASES }) };
    } catch (cause) {
        const message = cause instanceof Error && /alias/i.test(cause.message) ? YAML_TOO_MANY_ALIASES_MESSAGE : yamlMalformedMessage(null);
        return { ok: false, message };
    }
}

async function decodeToml(text: string): Promise<DecodeResult> {
    const { parse } = await load("toml");
    try {
        return { ok: true, value: parse(text) };
    } catch (cause) {
        const line = typeof (cause as { line?: unknown }).line === "number" ? (cause as { line: number }).line : null;
        return { ok: false, message: tomlMalformedMessage(line) };
    }
}

async function decodeJsonc(text: string): Promise<DecodeResult> {
    const { parse } = await load("jsonc");
    const errors: Array<{ offset: number }> = [];
    // jsonc-parser returns a partial value on errors: any error refuses the file.
    const value: unknown = parse(text, errors as never, { allowTrailingComma: true, disallowComments: false, allowEmptyContent: false });
    if (errors.length > 0) return { ok: false, message: jsoncMalformedMessage(lineAt(text, errors[0].offset)) };
    return { ok: true, value };
}

/** Text in a non-JSON format as plain data. JSON is read by the envelope reader directly. */
export async function decodeDocumentText(text: string, format: Exclude<DocumentFormat, "json">): Promise<DecodeResult> {
    switch (format) {
        case "yaml":
            return decodeYaml(text);
        case "toml":
            return decodeToml(text);
        case "jsonc":
            return decodeJsonc(text);
    }
}
