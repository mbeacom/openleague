import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPlannerBuild, unguardedProcessEnvCount } from "@/scripts/check-planner-build";
import { aiConnectSrc, resolveAiOrigins } from "@/apps/planner/ai-origins";

const PUBLIC_CSP = "default-src 'self'; connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*; form-action 'none'";
const cspHtml = (csp: string) =>
    `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<script type="module" src="./assets/index-abc.js"></script></head><body></body></html>';
const GOOD_HTML = cspHtml(PUBLIC_CSP);
const GOOD_JS = 'const FORMAT = "openleague.practice-plan"; export {};';
/** The lazily loaded Word export chunk. */
const LAZY_JS = 'const PART = "word/document.xml"; export {};';
/** The lazily loaded AI adapter chunk (ADR-0023). */
const AI_JS = 'const H = { "anthropic-dangerous-direct-browser-access": "true" }; export {};';

async function fixture(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "planner-build-"));
    for (const [name, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
        await writeFile(path.join(dir, name), text);
    }
    return dir;
}

describe("checkPlannerBuild", () => {
    it("passes a relative, CSP-protected, telemetry-free bundle", async () => {
        expect(
            await checkPlannerBuild(
                await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS }),
            ),
        ).toEqual([]);
    });

    it("reads a CSP whose quotes are written as entities", async () => {
        const html = cspHtml(PUBLIC_CSP.replace(/'/g, "&#39;"));
        expect(
            await checkPlannerBuild(await fixture({ "index.html": html, "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS })),
        ).toEqual([]);
    });

    it("fails when the built connect-src differs from the resolved AI origin allowlist", async () => {
        const files = { "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS };
        const narrow = await checkPlannerBuild(await fixture({ ...files, "index.html": cspHtml("default-src 'self'; connect-src 'self'") }));
        expect(narrow.join("\n")).toMatch(/connect-src is "connect-src 'self'", but the AI origin allowlist resolves to/);
        // A self-hosted build: the public CSP no longer matches the resolved list.
        const selfHosted = await checkPlannerBuild(await fixture({ ...files, "index.html": GOOD_HTML }), {
            aiOrigins: resolveAiOrigins("https://models.example:8443"),
        });
        expect(selfHosted.join("\n")).toMatch(/https:\/\/models\.example:8443/);
        const matching = await checkPlannerBuild(
            await fixture({ ...files, "index.html": cspHtml(`default-src 'self'; ${aiConnectSrc(resolveAiOrigins("https://models.example:8443"))}`) }),
            { aiOrigins: resolveAiOrigins("https://models.example:8443") },
        );
        expect(matching).toEqual([]);
    });

    it("requires Trusted Types in the CSP when it is enabled", async () => {
        const files = { "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS };
        const problems = await checkPlannerBuild(await fixture({ ...files, "index.html": GOOD_HTML }), { trustedTypes: true });
        expect(problems.join("\n")).toMatch(/require-trusted-types-for/);
        const withTt = await checkPlannerBuild(await fixture({ ...files, "index.html": cspHtml(`${PUBLIC_CSP}; require-trusted-types-for 'script'`) }), {
            trustedTypes: true,
        });
        expect(withTt).toEqual([]);
    });

    it("fails when AI adapter code is in the entry chunk, or missing", async () => {
        const inEntry = await checkPlannerBuild(
            await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${AI_JS}`, "assets/docx-abc.js": LAZY_JS }),
        );
        expect(inEntry.join("\n")).toMatch(/\(the entry chunk\) contains "anthropic-dangerous-direct-browser-access"/);
        const missing = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS }));
        expect(missing.join("\n")).toMatch(/no emitted file contains "anthropic-dangerous-direct-browser-access"/);
    });

    it("fails when an AI chunk carries eval-style dynamic code", async () => {
        const problems = await checkPlannerBuild(
            await fixture({
                "index.html": GOOD_HTML,
                "assets/index-abc.js": GOOD_JS,
                "assets/docx-abc.js": LAZY_JS,
                "assets/ai-abc.js": `${AI_JS}\nconst f = new Function("return 1");`,
            }),
        );
        expect(problems.join("\n")).toMatch(/ai-abc\.js carries AI adapter code and eval-style dynamic code/);
    });

    it("fails when nothing was built", async () => {
        const problems = await checkPlannerBuild(await fixture({}));
        expect(problems[0]).toMatch(/index\.html is missing/);
    });

    it("fails on absolute asset URLs and a missing CSP", async () => {
        const html = '<html><head><script type="module" src="/assets/index.js"></script></head></html>';
        const problems = await checkPlannerBuild(await fixture({ "index.html": html, "assets/index.js": GOOD_JS }));
        expect(problems).toEqual(
            expect.arrayContaining([expect.stringMatching(/absolute \/assets\//), expect.stringMatching(/Content-Security-Policy/)]),
        );
    });

    it.each([
        ['fetch("https://o1.ingest.sentry.io/api")', "ingest.sentry"],
        ['load("https://www.googletagmanager.com/gtag/js")', "googletagmanager.com"],
        ["const u = window.__NEXT_DATA__;", "__NEXT_DATA__"],
        ['const k = "NEXT_PUBLIC_X";', "NEXT_PUBLIC_"],
    ])("fails on %s", async (snippet, pattern) => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${snippet}` }));
        expect(problems.join("\n")).toContain(pattern);
    });

    it("fails on an unguarded process.env read, but not a guarded one", async () => {
        const guarded = 'const m = typeof process !== "undefined" && process.env.DEBUG;';
        expect(
            await checkPlannerBuild(
                await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${guarded}`, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS }),
            ),
        ).toEqual([]);
        const bare = "const m = process.env.DEBUG;";
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${bare}` }));
        expect(problems.join("\n")).toMatch(/process\.env/);
    });

    it("fails when the plan-document module is missing from the bundle", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": "export {};" }));
        expect(problems.join("\n")).toMatch(/openleague\.practice-plan/);
    });

    it("fails when the Word export is in the entry chunk instead of its own lazy chunk", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${LAZY_JS}` }));
        expect(problems.join("\n")).toMatch(/assets\/index-abc\.js \(the entry chunk\) contains "word\/document\.xml"/);
    });

    it("treats a modulepreload target as an entry chunk", async () => {
        const html = GOOD_HTML.replace("</head>", '<link rel="modulepreload" crossorigin href="./assets/vendor-abc.js"></head>');
        const problems = await checkPlannerBuild(
            await fixture({ "index.html": html, "assets/index-abc.js": GOOD_JS, "assets/vendor-abc.js": LAZY_JS }),
        );
        expect(problems.join("\n")).toMatch(/assets\/vendor-abc\.js \(the entry chunk\) contains "word\/document\.xml"/);
    });

    it("fails when an entry script or modulepreload target is missing from the build", async () => {
        const html = GOOD_HTML.replace("</head>", '<link rel="modulepreload" href="./assets/vendor-abc.js"></head>');
        const problems = await checkPlannerBuild(await fixture({ "index.html": html, "assets/docx-abc.js": `${GOOD_JS}\n${LAZY_JS}` }));
        const text = problems.join("\n");
        expect(text).toMatch(/assets\/index-abc\.js.*missing/);
        expect(text).toMatch(/assets\/vendor-abc\.js.*missing/);
    });

    it("fails when no chunk carries the Word export", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS }));
        expect(problems.join("\n")).toMatch(/word\/document\.xml/);
    });
});

describe("unguardedProcessEnvCount", () => {
    it("counts only reads without a typeof process guard in the same expression", () => {
        expect(unguardedProcessEnvCount("process.env.A; x; process.env.B")).toBe(2);
        expect(unguardedProcessEnvCount('typeof process !== "undefined" && process.env.A')).toBe(0);
        expect(unguardedProcessEnvCount('const a=typeof process<"u"&&(e=process.env.X),b=1')).toBe(0);
    });

    it("does not let a guard cover a later statement", () => {
        expect(unguardedProcessEnvCount('typeof process !== "undefined" && process.env.A; process.env.B')).toBe(1);
        expect(unguardedProcessEnvCount('const a=typeof process<"u"&&process.env.A,b=process.env.B')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){x()}process.env.B')).toBe(1);
    });

    it("does not treat process && as a guard (an undeclared process throws)", () => {
        expect(unguardedProcessEnvCount("process && process.env.A")).toBe(1);
    });

    it.each(["process?.env.A", 'process["env"].A', "process['env'].A", 'process?.["env"].A'])("counts the bare read %s", (read) => {
        expect(unguardedProcessEnvCount(read)).toBe(1);
        expect(unguardedProcessEnvCount(`typeof process<"u"&&${read}`)).toBe(0);
    });

    it("allows an optional read off another object (property access can't throw a ReferenceError)", () => {
        expect(unguardedProcessEnvCount("globalThis.process?.env.A")).toBe(0);
        expect(unguardedProcessEnvCount("globalThis.process.env.A")).toBe(1);
    });

    it("treats the block directly under a typeof-process if as guarded", () => {
        expect(unguardedProcessEnvCount('if(typeof process<"u"){process.env.A}')).toBe(0);
        expect(unguardedProcessEnvCount('if (typeof process !== "undefined") { setup(); const a = process.env.A; }')).toBe(0);
        expect(unguardedProcessEnvCount("if(typeof process!='undefined'){x=1,y=process.env.A}")).toBe(0);
        expect(unguardedProcessEnvCount('if(typeof process==="object"){process.env.A}')).toBe(0);
        expect(unguardedProcessEnvCount('if(typeof process<"u"&&x){process.env.A}')).toBe(0);
        expect(unguardedProcessEnvCount('if(x){}else if (typeof process!=="undefined"){process.env.A}')).toBe(0);
    });

    it("stays strict about everything else an if touches", () => {
        // the else branch, a nested block, an object literal, an escape hatch, a negated check, a later statement
        expect(unguardedProcessEnvCount('if(typeof process<"u"){}else{process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){if(x){process.env.A}}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){f({a:process.env.A})}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"||y){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process==="undefined"){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){a()}process.env.B')).toBe(1);
        expect(unguardedProcessEnvCount('if(!(typeof process!=="undefined")){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(y?0:typeof process<"u"){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(f(typeof process<"u")){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(a,typeof process<"u"){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"|y){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('elif(typeof process<"u"){process.env.A}')).toBe(1);
    });
});
