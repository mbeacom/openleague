/**
 * Checks dist/planner after `bun run planner:build` (ADR-0020): the static
 * planner must work from any subfolder, carry its CSP, contain no Next.js
 * runtime or unguarded process.env (both crash or bloat a browser-only
 * bundle), contain no telemetry, and actually include the plan format. Its
 * CSP's connect-src must equal the AI origin allowlist, and AI adapter code
 * must load lazily (ADR-0023).
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aiConnectSrc, resolveAiOrigins } from "../apps/planner/ai-origins";
import { TRUSTED_TYPES_ENABLED } from "../apps/planner/build-config";

export const FORBIDDEN_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "NEXT_PUBLIC_", reason: "a Next.js environment variable reached the static bundle" },
    { pattern: "__NEXT_DATA__", reason: "Next.js runtime code reached the static bundle" },
    { pattern: "next/dist", reason: "Next.js runtime code reached the static bundle" },
    { pattern: "sentry.io", reason: "telemetry is not allowed in the static planner" },
    { pattern: "ingest.sentry", reason: "telemetry is not allowed in the static planner" },
    { pattern: "googletagmanager.com", reason: "analytics are not allowed in the static planner" },
    { pattern: "google-analytics.com", reason: "analytics are not allowed in the static planner" },
    { pattern: "umami", reason: "analytics are not allowed in the static planner" },
    { pattern: "_vercel/insights", reason: "analytics are not allowed in the static planner" },
    { pattern: "vitals.vercel", reason: "analytics are not allowed in the static planner" },
];

/** A literal only the AI adapters contain (ADR-0023): the Anthropic browser-access header. */
export const AI_ADAPTER_MARKER = "anthropic-dangerous-direct-browser-access";

/**
 * Literals only each file-format library contains (config-format exports spec):
 * `yaml`'s alias-limit error, `smol-toml`'s parse error prefix, and a name from
 * `jsonc-parser`'s scanner.
 */
export const FORMAT_LIBRARY_MARKERS = {
    yaml: "Excessive alias count",
    toml: "Invalid TOML document",
    jsonc: "closeBracket",
} as const;

export const REQUIRED_IN_BUNDLE = ["openleague.practice-plan", "word/document.xml", AI_ADAPTER_MARKER, ...Object.values(FORMAT_LIBRARY_MARKERS)];

/** Code that must load only on demand, by a literal only it contains. */
export const LAZY_ONLY_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "word/document.xml", reason: "the Word export (docx) must load only through import(), on click" },
    { pattern: AI_ADAPTER_MARKER, reason: "AI adapter code must load only through import(), when the coach opens an AI feature (ADR-0023)" },
    ...Object.entries(FORMAT_LIBRARY_MARKERS).map(([format, pattern]) => ({
        pattern,
        reason: `the ${format} file-format library must load only through import(), when a file in that format is saved or opened`,
    })),
];

/** Dynamic code that must never appear in an AI chunk (spec R6). */
const EVAL_STYLE = /\beval\s*\(|\bnew\s+Function\s*\(/;

export interface CheckOptions {
    /** The resolved AI origin allowlist; the built connect-src must equal aiConnectSrc(aiOrigins). */
    aiOrigins?: readonly string[];
    /** Whether the build should carry Trusted Types. */
    trustedTypes?: boolean;
}

function decodeAttribute(value: string): string {
    return value
        .replace(/&#39;|&#x27;|&apos;/g, "'")
        .replace(/&quot;|&#34;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/** The CSP meta's content, decoded, or null. */
export function builtCsp(html: string): string | null {
    const tag = Array.from(html.matchAll(/<meta\b[^>]*>/g), (match) => match[0]).find((meta) => /http-equiv="Content-Security-Policy"/.test(meta));
    const content = tag ? /\bcontent="([^"]*)"/.exec(tag)?.[1] : undefined;
    return content === undefined ? null : decodeAttribute(content);
}

/** The module scripts and modulepreload chunks index.html loads up front, relative to outDir. */
function entryScripts(html: string): string[] {
    const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="\.\/([^"]+\.js)"/g), (match) => match[1]);
    const preloads = Array.from(html.matchAll(/<link\b[^>]*>/g), (match) => match[0])
        .filter((tag) => /\brel="modulepreload"/.test(tag))
        .map((tag) => /\bhref="\.\/([^"]+\.js)"/.exec(tag)?.[1])
        .filter((href): href is string => href !== undefined);
    return Array.from(new Set([...scripts, ...preloads]));
}

/** `process.env`, `process?.env`, `process["env"]` and `process?.["env"]`, capturing what precedes `process`. */
const PROCESS_ENV = /(\.\s*)?\bprocess\s*(\?\.\s*env\b|\.\s*env\b|(\?\.)?\s*\[\s*["']env["']\s*\])/g;
const TYPEOF_PROCESS = /\btypeof\s+process\b/;

/** An if condition that proves `process` exists: `!== "undefined"`, `!= "undefined"`, minified `<"u"`, or `=== "object"`. */
const PROCESS_EXISTS = /^typeof\s+process\s*(?:!==?\s*["']undefined["']|<\s*["']u["']|===?\s*["']object["'])$/;

/** The `{` of the innermost block or object literal still open at `index`, or -1. Strings aren't parsed. */
function enclosingBrace(text: string, index: number): number {
    let depth = 0;
    for (let i = index - 1; i >= 0; i--) {
        if (text[i] === "}") depth++;
        else if (text[i] === "{") {
            if (depth === 0) return i;
            depth--;
        }
    }
    return -1;
}

/**
 * True when the `{` at `brace` opens the block of `if (cond)` and `cond` proves
 * `process` exists in its first `&&` operand, with no way around it. Bundlers keep guards like
 * `if(typeof process<"u"){…process.env…}`. Deliberately strict: only that
 * block's own statements count, never an `else` block, a nested block, function
 * or object literal, or anything after the closing `}`.
 */
function opensProcessGuardedIf(text: string, brace: number): boolean {
    if (brace < 0) return false;
    let close = brace - 1;
    while (close >= 0 && /\s/.test(text[close])) close--;
    if (text[close] !== ")") return false;
    let depth = 0;
    let open = -1;
    for (let i = close; i >= 0; i--) {
        if (text[i] === ")") depth++;
        else if (text[i] === "(" && --depth === 0) {
            open = i;
            break;
        }
    }
    if (open < 0) return false;
    let keyword = open - 1;
    while (keyword >= 0 && /\s/.test(text[keyword])) keyword--;
    if (text.slice(keyword - 1, keyword + 1) !== "if" || /[\w$]/.test(text[keyword - 2] ?? "")) return false;
    let condition = text.slice(open + 1, close).trim();
    if (condition.startsWith("(") && condition.endsWith(")")) condition = condition.slice(1, -1).trim();
    // A pure `&&` chain whose first operand is the check: no `|`, `?:`, comma or negation to escape it.
    if (/[|?,]/.test(condition) || condition.startsWith("!")) return false;
    return PROCESS_EXISTS.test(condition.split("&&")[0].trim());
}

/**
 * The text from the start of the statement-level expression containing `index`:
 * scanning back, it stops at `;`, `{`, `}` or `,` outside any parentheses or
 * brackets it has to skip over. Strings aren't parsed; a heuristic for bundles.
 */
function enclosingExpression(text: string, index: number): string {
    let depth = 0;
    for (let i = index - 1; i >= 0; i--) {
        const char = text[i];
        if (char === ")" || char === "]") depth++;
        else if (char === "(" || char === "[") depth = Math.max(0, depth - 1);
        else if (depth === 0 && (char === ";" || char === "{" || char === "}" || char === ",")) return text.slice(i + 1, index);
    }
    return text.slice(0, index);
}

/**
 * Reads of `process.env` (Vite has no `process`) not governed by a `typeof process`
 * check in the same expression. `process &&` is no guard: an undeclared `process`
 * throws. An optional read off another object (`globalThis.process?.env`) can't throw.
 * A read in the block directly under a process-proving `if` is guarded too (opensProcessGuardedIf).
 */
export function unguardedProcessEnvCount(text: string): number {
    let count = 0;
    for (const match of text.matchAll(PROCESS_ENV)) {
        const [, member, access, optionalBracket] = match;
        if (member && (access.startsWith("?.") || optionalBracket)) continue;
        const guarded =
            TYPEOF_PROCESS.test(enclosingExpression(text, match.index)) ||
            opensProcessGuardedIf(text, enclosingBrace(text, match.index));
        if (!guarded) count++;
    }
    return count;
}

async function listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
        }),
    );
    return nested.flat();
}

export async function checkPlannerBuild(
    outDir: string,
    { aiOrigins = resolveAiOrigins(undefined), trustedTypes = TRUSTED_TYPES_ENABLED }: CheckOptions = {},
): Promise<string[]> {
    const indexPath = path.join(outDir, "index.html");
    if (!existsSync(indexPath)) return [`${indexPath} is missing: run bun run planner:build first`];

    const problems: string[] = [];
    const html = await readFile(indexPath, "utf8");
    if (/(?:src|href)="\/assets\//.test(html)) {
        problems.push('index.html uses absolute /assets/ URLs; the planner must work from any subfolder (base: "./")');
    }
    const csp = builtCsp(html);
    if (csp === null) {
        problems.push("index.html has no Content-Security-Policy meta");
    } else {
        // ADR-0023: connect-src is exactly the resolved allowlist, the one the adapters check against.
        const connect = csp.split(";").map((directive) => directive.trim()).filter((directive) => directive.startsWith("connect-src"));
        const expected = aiConnectSrc(aiOrigins);
        if (connect.length !== 1 || connect[0] !== expected) {
            problems.push(`the CSP's connect-src is "${connect.join("; ")}", but the AI origin allowlist resolves to "${expected}"`);
        }
        if (trustedTypes && !/require-trusted-types-for 'script'/.test(csp)) {
            problems.push("Trusted Types is enabled, but the CSP lacks require-trusted-types-for 'script'");
        }
    }

    const files = (await listFiles(outDir)).filter((file) => /\.(?:js|html)$/.test(file));
    const contents = await Promise.all(files.map(async (file) => [path.relative(outDir, file), await readFile(file, "utf8")] as const));
    for (const [file, text] of contents) {
        const bare = unguardedProcessEnvCount(text);
        if (bare > 0) problems.push(`${file} reads process.env ${bare} time(s) without a guard (Vite has no process)`);
        for (const { pattern, reason } of FORBIDDEN_IN_BUNDLE) {
            if (text.includes(pattern)) problems.push(`${file} contains "${pattern}": ${reason}`);
        }
        if (text.includes(AI_ADAPTER_MARKER) && EVAL_STYLE.test(text)) {
            problems.push(`${file} carries AI adapter code and eval-style dynamic code (eval or new Function), which the AI features must never use`);
        }
    }
    for (const entry of entryScripts(html)) {
        const text = contents.find(([file]) => file.split(path.sep).join("/") === entry)?.[1];
        if (text === undefined) {
            problems.push(`${entry} is referenced by index.html but missing from the build`);
            continue;
        }
        for (const { pattern, reason } of LAZY_ONLY_IN_BUNDLE) {
            if (text.includes(pattern)) problems.push(`${entry} (the entry chunk) contains "${pattern}": ${reason}`);
        }
    }
    for (const needle of REQUIRED_IN_BUNDLE) {
        if (!contents.some(([, text]) => text.includes(needle))) {
            problems.push(`no emitted file contains "${needle}": a required module is missing from the bundle`);
        }
    }
    return problems;
}

async function main() {
    const outDir = path.join(process.cwd(), "dist", "planner");
    // The same variable the Vite config read for this build.
    const problems = await checkPlannerBuild(outDir, { aiOrigins: resolveAiOrigins(process.env.OPENLEAGUE_AI_CONNECT_ORIGINS) });
    if (problems.length > 0) {
        console.error(`Static planner bundle check failed (${problems.length}):`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    console.log(`Static planner bundle OK (${path.relative(process.cwd(), outDir)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
