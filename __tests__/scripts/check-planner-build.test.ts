import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAT_LIBRARY_MARKERS, GOOGLE_DRIVE_MARKERS, SAVED_FILES_MARKER, checkPlannerBuild, unguardedProcessEnvCount } from "@/scripts/check-planner-build";
import { resolveAiOrigins } from "@/apps/planner/ai-origins";
import { plannerCsp } from "@/apps/planner/build-config";
import { resolveCloudSettings } from "@/apps/planner/cloud-config";

const PUBLIC_CSP = plannerCsp(resolveAiOrigins(undefined));
/** A build configured for Google Drive (fictional values), and its policy. */
const GOOGLE_CLOUD = resolveCloudSettings({
    OPENLEAGUE_GOOGLE_CLIENT_ID: "123-fictional.apps.googleusercontent.com",
    OPENLEAGUE_GOOGLE_API_KEY: "fictional-key",
    OPENLEAGUE_GOOGLE_APP_ID: "123456789",
});
const GOOGLE_CSP = plannerCsp(resolveAiOrigins(undefined), { cloud: GOOGLE_CLOUD });
/** The lazily loaded Google Drive connector chunk. */
const GOOGLE_JS = `const G = ${JSON.stringify(GOOGLE_DRIVE_MARKERS)}; export {};`;
const cspHtml = (csp: string) =>
    `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<script type="module" src="./assets/index-abc.js"></script></head><body></body></html>';
const GOOD_HTML = cspHtml(PUBLIC_CSP);
const GOOD_JS = 'const FORMAT = "openleague.practice-plan"; export {};';
/** The lazily loaded file-format libraries (config-format exports), as one fixture line. */
const FORMATS_JS = `const F = ${JSON.stringify(Object.values(FORMAT_LIBRARY_MARKERS))};`;
/** The lazily loaded Saved files screen (ADR-0022), as one fixture line. */
const SAVED_FILES_JS = `const S = ${JSON.stringify(SAVED_FILES_MARKER)};`;
/** The lazily loaded Word export chunk, with the format libraries and the Saved files screen beside it. */
const LAZY_JS = `const PART = "word/document.xml"; ${FORMATS_JS} ${SAVED_FILES_JS} export {};`;
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
        expect(narrow.join("\n")).toMatch(/connect-src is "connect-src 'self'", but the AI origin allowlist and cloud connectors resolve to/);
        // A self-hosted build: the public CSP no longer matches the resolved list.
        const selfHosted = await checkPlannerBuild(await fixture({ ...files, "index.html": GOOD_HTML }), {
            aiOrigins: resolveAiOrigins("https://models.example:8443"),
        });
        expect(selfHosted.join("\n")).toMatch(/https:\/\/models\.example:8443/);
        const matching = await checkPlannerBuild(
            await fixture({ ...files, "index.html": cspHtml(plannerCsp(resolveAiOrigins("https://models.example:8443"))) }),
            { aiOrigins: resolveAiOrigins("https://models.example:8443") },
        );
        expect(matching).toEqual([]);
    });

    it("fails when the CSP differs from the build's in any directive", async () => {
        const files = { "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS };
        const loose = await checkPlannerBuild(await fixture({ ...files, "index.html": cspHtml(PUBLIC_CSP.replace("script-src 'self'", "script-src 'self' https://cdn.example")) }));
        expect(loose.join("\n")).toMatch(/the CSP is ".*https:\/\/cdn\.example.*", but this build's settings resolve to/);
    });

    it("requires Google Drive's hosts and lazy chunk exactly when the build configures it (spec R9)", async () => {
        const files = { "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS };
        expect(await checkPlannerBuild(await fixture({ ...files, "assets/google-drive-abc.js": GOOGLE_JS, "index.html": cspHtml(GOOGLE_CSP) }), { cloud: GOOGLE_CLOUD })).toEqual([]);

        // Configured, but the policy left the hosts out, and the chunk is missing.
        const bare = (await checkPlannerBuild(await fixture({ ...files, "index.html": GOOD_HTML }), { cloud: GOOGLE_CLOUD })).join("\n");
        expect(bare).toMatch(/connect-src is .*, but the AI origin allowlist and cloud connectors resolve to ".*https:\/\/www\.googleapis\.com/);
        expect(bare).toMatch(/no emitted file contains "apis\.google\.com\/js\/api\.js"/);

        // Not configured: neither the hosts nor the connector may ship.
        const unasked = (await checkPlannerBuild(await fixture({ ...files, "assets/google-drive-abc.js": GOOGLE_JS, "index.html": cspHtml(GOOGLE_CSP) }))).join("\n");
        expect(unasked).toMatch(/the CSP is ".*https:\/\/accounts\.google\.com.*", but this build's settings resolve to/);
        expect(unasked).toMatch(/google-drive-abc\.js contains "initTokenClient", but this build doesn't configure Google Drive/);
    });

    it("fails when the Google Drive connector is in the entry chunk", async () => {
        const problems = await checkPlannerBuild(
            await fixture({ "index.html": cspHtml(GOOGLE_CSP), "assets/index-abc.js": `${GOOD_JS}\n${GOOGLE_JS}`, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS }),
            { cloud: GOOGLE_CLOUD },
        );
        expect(problems.join("\n")).toMatch(/\(the entry chunk\) contains "apis\.google\.com\/js\/api\.js": the Google Drive connector/);
        expect(problems.join("\n")).toMatch(/\(the entry chunk\) contains "initTokenClient"/);
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

    it("fails when a file-format library is in the entry chunk, or missing", async () => {
        const inEntry = await checkPlannerBuild(
            await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${FORMATS_JS}`, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS }),
        );
        expect(inEntry.join("\n")).toMatch(/\(the entry chunk\) contains "Excessive alias count": the yaml file-format library/);
        expect(inEntry.join("\n")).toMatch(/\(the entry chunk\) contains "Invalid TOML document"/);
        const docxOnly = 'const PART = "word/document.xml"; export {};';
        const missing = await checkPlannerBuild(
            await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": docxOnly, "assets/ai-abc.js": AI_JS }),
        );
        expect(missing.join("\n")).toMatch(/no emitted file contains "closeBracket"/);
    });

    it("fails when the Saved files screen is in the entry chunk, or missing", async () => {
        const inEntry = await checkPlannerBuild(
            await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${SAVED_FILES_JS}`, "assets/docx-abc.js": LAZY_JS, "assets/ai-abc.js": AI_JS }),
        );
        expect(inEntry.join("\n")).toMatch(/\(the entry chunk\) contains "Nothing to recover/);
        const lazyWithout = LAZY_JS.replace(SAVED_FILES_JS, "");
        const missing = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS, "assets/docx-abc.js": lazyWithout, "assets/ai-abc.js": AI_JS }));
        expect(missing.join("\n")).toMatch(/no emitted file contains "Nothing to recover/);
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
