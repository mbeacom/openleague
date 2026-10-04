/**
 * Checks dist/planner after `bun run planner:build` (ADR-0020): the static
 * planner must work from any subfolder, carry its CSP, contain no Next.js
 * runtime or unguarded process.env (both crash or bloat a browser-only
 * bundle), contain no telemetry, and actually include the plan format.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

export const REQUIRED_IN_BUNDLE = ["openleague.practice-plan", "word/document.xml"];

/** Code that must load only on demand, by a literal only it contains. */
export const LAZY_ONLY_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "word/document.xml", reason: "the Word export (docx) must load only through import(), on click" },
];

/** The module scripts index.html loads up front, relative to outDir. */
function entryScripts(html: string): string[] {
    return Array.from(html.matchAll(/<script\b[^>]*\bsrc="\.\/([^"]+\.js)"/g), (match) => match[1]);
}

/** `process.env`, `process?.env`, `process["env"]` and `process?.["env"]`, capturing what precedes `process`. */
const PROCESS_ENV = /(\.\s*)?\bprocess\s*(\?\.\s*env\b|\.\s*env\b|(\?\.)?\s*\[\s*["']env["']\s*\])/g;
const TYPEOF_PROCESS = /\btypeof\s+process\b/;

/** An if condition that proves `process` exists: `!== "undefined"`, `!= "undefined"`, minified `<"u"`, or `=== "object"`. */
const PROCESS_EXISTS = /\btypeof\s+process\s*(?:!==?\s*["']undefined["']|<\s*["']u["']|===?\s*["']object["'])/;

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
 * `process` exists with no `||` to escape it. Bundlers keep guards like
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
    const condition = text.slice(open + 1, close);
    return PROCESS_EXISTS.test(condition) && !condition.includes("||");
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

export async function checkPlannerBuild(outDir: string): Promise<string[]> {
    const indexPath = path.join(outDir, "index.html");
    if (!existsSync(indexPath)) return [`${indexPath} is missing: run bun run planner:build first`];

    const problems: string[] = [];
    const html = await readFile(indexPath, "utf8");
    if (/(?:src|href)="\/assets\//.test(html)) {
        problems.push('index.html uses absolute /assets/ URLs; the planner must work from any subfolder (base: "./")');
    }
    if (!html.includes('http-equiv="Content-Security-Policy"')) {
        problems.push("index.html has no Content-Security-Policy meta");
    }

    const files = (await listFiles(outDir)).filter((file) => /\.(?:js|html)$/.test(file));
    const contents = await Promise.all(files.map(async (file) => [path.relative(outDir, file), await readFile(file, "utf8")] as const));
    for (const [file, text] of contents) {
        const bare = unguardedProcessEnvCount(text);
        if (bare > 0) problems.push(`${file} reads process.env ${bare} time(s) without a guard (Vite has no process)`);
        for (const { pattern, reason } of FORBIDDEN_IN_BUNDLE) {
            if (text.includes(pattern)) problems.push(`${file} contains "${pattern}": ${reason}`);
        }
    }
    for (const entry of entryScripts(html)) {
        const text = contents.find(([file]) => file.split(path.sep).join("/") === entry)?.[1];
        if (text === undefined) continue;
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
    const problems = await checkPlannerBuild(outDir);
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
