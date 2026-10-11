/**
 * Checks dist/planner after `bun run planner:build` (ADR-0020): the static
 * planner must work from any subfolder, carry its CSP, contain no Next.js
 * runtime or unguarded process.env (both crash or bloat a browser-only
 * bundle), contain no telemetry, and actually include the plan format. Its
 * CSP's connect-src must equal the AI origin allowlist plus the configured
 * cloud connectors' hosts, and AI adapter code must load lazily (ADR-0023).
 * Google Drive's code and MSAL (OneDrive) load lazily too, and Google Drive's
 * is absent from a build that doesn't configure it (storage connectors spec
 * R9). frame-src appears exactly when a configured connector needs it, and
 * auth/redirect.html loads only MSAL's redirect bridge (spec R6, Testing).
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAiOrigins } from "../apps/planner/ai-origins";
import { TRUSTED_TYPES_ENABLED, plannerCsp } from "../apps/planner/build-config";
import { NO_CLOUD, resolveCloudSettings, type CloudSettings } from "../apps/planner/cloud-config";

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

/**
 * A literal only the Saved files screen contains (ADR-0022): linked files and
 * recovered copies are a rare visit, so that screen loads on demand. The
 * storage bar and the sync engine stay in the entry chunk: a practice's page
 * needs them on open.
 */
export const SAVED_FILES_MARKER = "Nothing to recover. When a document is replaced from a file";

/**
 * Literals only the Google Drive connector's chunk contains (ADR-0022): the
 * Picker's loader URL and the Identity Services token call. The CSP names
 * hosts, never these paths, so a policy string can't trip them.
 */
export const GOOGLE_DRIVE_MARKERS = ["apis.google.com/js/api.js", "initTokenClient"] as const;

/**
 * A literal only MSAL contains (one of its error codes): the OneDrive
 * connector's sign-in library must load only through import() (spec R6).
 */
export const MSAL_MARKER = "interaction_in_progress";

/** The title MSAL's redirect bridge sets: the one thing auth/redirect.html must run. */
export const REDIRECT_BRIDGE_MARKER = "Microsoft Authentication";

/** The sign-in redirect page, relative to outDir; deployed at /planner/auth/redirect.html. */
export const REDIRECT_PAGE = "auth/redirect.html";

/** Literals of the app itself (the plan format; React's element tag), which the redirect page must never load. */
export const APP_MARKERS = ["openleague.practice-plan", "react.transitional.element", "react.element"] as const;

export const REQUIRED_IN_BUNDLE = ["openleague.practice-plan", "word/document.xml", AI_ADAPTER_MARKER, SAVED_FILES_MARKER, ...Object.values(FORMAT_LIBRARY_MARKERS)];

/** Code that must load only on demand, by a literal only it contains. */
export const LAZY_ONLY_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "word/document.xml", reason: "the Word export (docx) must load only through import(), on click" },
    { pattern: AI_ADAPTER_MARKER, reason: "AI adapter code must load only through import(), when the coach opens an AI feature (ADR-0023)" },
    { pattern: SAVED_FILES_MARKER, reason: "the Saved files screen must load only through import(), when the coach opens it (ADR-0022)" },
    ...GOOGLE_DRIVE_MARKERS.map((pattern) => ({
        pattern,
        reason: "the Google Drive connector and Google's loaders must load only through import(), when the coach chooses Google Drive (storage connectors spec R5)",
    })),
    { pattern: MSAL_MARKER, reason: "MSAL (the OneDrive connector's sign-in library) must load only through import(), when the coach uses OneDrive (spec R6)" },
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
    /** The cloud connectors the build was configured with (spec R9); none when omitted. */
    cloud?: CloudSettings;
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

/**
 * The module scripts and modulepreload chunks a page loads up front, relative
 * to outDir. `prefix` is the page's way back to outDir: "./" for index.html,
 * "../" for auth/redirect.html.
 */
function entryScripts(html: string, prefix = "./"): string[] {
    const preloadHref = new RegExp(`\\bhref="${escapePrefix(prefix)}([^"]+\\.js)"`);
    const preloads = Array.from(html.matchAll(/<link\b[^>]*>/g), (match) => match[0])
        .filter((tag) => /\brel="modulepreload"/.test(tag))
        .map((tag) => preloadHref.exec(tag)?.[1])
        .filter((href): href is string => href !== undefined);
    return Array.from(new Set([...moduleScripts(html, prefix), ...preloads]));
}

const escapePrefix = (prefix: string) => prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** A page's own <script src> files, relative to outDir. */
function moduleScripts(html: string, prefix: string): string[] {
    const scriptSrc = new RegExp(`<script\\b[^>]*\\bsrc="${escapePrefix(prefix)}([^"]+\\.js)"`, "g");
    return Array.from(html.matchAll(scriptSrc), (match) => match[1]);
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
    { aiOrigins = resolveAiOrigins(undefined), trustedTypes = TRUSTED_TYPES_ENABLED, cloud = NO_CLOUD }: CheckOptions = {},
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
        // ADR-0023: connect-src is exactly the resolved allowlist, the one the adapters check against, plus the configured providers' hosts.
        const expectedCsp = plannerCsp(aiOrigins, { trustedTypes, cloud });
        const directives = (policy: string) => policy.split(";").map((directive) => directive.trim());
        const connect = directives(csp).filter((directive) => directive.startsWith("connect-src"));
        const expected = directives(expectedCsp).find((directive) => directive.startsWith("connect-src"));
        if (connect.length !== 1 || connect[0] !== expected) {
            problems.push(`the CSP's connect-src is "${connect.join("; ")}", but the AI origin allowlist and cloud connectors resolve to "${expected}"`);
        }
        // frame-src exactly as the configured connectors need it (OneDrive's silent renewal), and absent otherwise.
        const frame = directives(csp).filter((directive) => directive.startsWith("frame-src"));
        const expectedFrame = directives(expectedCsp).find((directive) => directive.startsWith("frame-src"));
        if (expectedFrame === undefined ? frame.length > 0 : frame.length !== 1 || frame[0] !== expectedFrame) {
            problems.push(
                expectedFrame === undefined
                    ? `the CSP has "${frame.join("; ")}", but no connector that needs frames is built`
                    : `the CSP's frame-src is "${frame.join("; ")}", but the configured connectors need "${expectedFrame}"`,
            );
        }
        if (trustedTypes && !/require-trusted-types-for 'script'/.test(csp)) {
            problems.push("Trusted Types is enabled, but the CSP lacks require-trusted-types-for 'script'");
        }
        // Storage connectors spec R9: provider hosts appear exactly when their connector is built in.
        if (csp !== expectedCsp) {
            problems.push(`the CSP is "${csp}", but this build's settings resolve to "${expectedCsp}"`);
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
    problems.push(...checkRedirectPage(contents, html, cloud.microsoft !== null));
    for (const needle of [...REQUIRED_IN_BUNDLE, ...(cloud.google ? GOOGLE_DRIVE_MARKERS : []), ...(cloud.microsoft ? [MSAL_MARKER] : [])]) {
        if (!contents.some(([, text]) => text.includes(needle))) {
            problems.push(`no emitted file contains "${needle}": a required module is missing from the bundle`);
        }
    }
    if (!cloud.google) {
        for (const needle of GOOGLE_DRIVE_MARKERS) {
            for (const [file, text] of contents) {
                if (text.includes(needle)) problems.push(`${file} contains "${needle}", but this build doesn't configure Google Drive (storage connectors spec R9)`);
            }
        }
    }
    return problems;
}

/**
 * auth/redirect.html (spec R6): required when OneDrive is built, checked
 * whenever present. It carries the CSP, loads the redirect bridge, and loads
 * nothing of the app: not index.html's own script, and no chunk with app code.
 */
function checkRedirectPage(contents: ReadonlyArray<readonly [string, string]>, indexHtml: string, oneDrive: boolean): string[] {
    const page = contents.find(([file]) => file.split(path.sep).join("/") === REDIRECT_PAGE)?.[1];
    if (page === undefined) return oneDrive ? [`${REDIRECT_PAGE} is missing: the OneDrive connector's sign-in popups and silent renewal end there`] : [];
    const problems: string[] = [];
    if (builtCsp(page) === null) problems.push(`${REDIRECT_PAGE} has no Content-Security-Policy meta`);
    const scripts = entryScripts(page, "../");
    if (scripts.length === 0) problems.push(`${REDIRECT_PAGE} loads no script: it must run MSAL's redirect bridge`);
    // index.html's own <script> (the app); a modulepreload both pages share (Vite's polyfill) is fine.
    const appScripts = new Set(moduleScripts(indexHtml, "./"));
    const texts: string[] = [];
    for (const script of scripts) {
        if (appScripts.has(script)) problems.push(`${REDIRECT_PAGE} loads ${script}, index.html's own script: the redirect page must load only the bridge`);
        const text = contents.find(([file]) => file.split(path.sep).join("/") === script)?.[1];
        if (text === undefined) {
            problems.push(`${script} is referenced by ${REDIRECT_PAGE} but missing from the build`);
            continue;
        }
        texts.push(text);
        for (const marker of APP_MARKERS) {
            if (text.includes(marker)) problems.push(`${script}, loaded by ${REDIRECT_PAGE}, contains "${marker}": the redirect page must load only the bridge, never the app`);
        }
    }
    if (texts.length > 0 && !texts.some((text) => text.includes(REDIRECT_BRIDGE_MARKER))) {
        problems.push(`${REDIRECT_PAGE} doesn't load MSAL's redirect bridge`);
    }
    return problems;
}

async function main() {
    const outDir = path.join(process.cwd(), "dist", "planner");
    // The same variables the Vite config read for this build.
    const problems = await checkPlannerBuild(outDir, {
        aiOrigins: resolveAiOrigins(process.env.OPENLEAGUE_AI_CONNECT_ORIGINS),
        cloud: resolveCloudSettings(process.env),
    });
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
