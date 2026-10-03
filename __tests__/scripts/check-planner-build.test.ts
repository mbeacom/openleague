import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPlannerBuild, unguardedProcessEnvCount } from "@/scripts/check-planner-build";

const GOOD_HTML =
    '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'">' +
    '<script type="module" src="./assets/index-abc.js"></script></head><body></body></html>';
const GOOD_JS = 'const FORMAT = "openleague.practice-plan"; export {};';

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
        expect(await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS }))).toEqual([]);
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
        expect(await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${guarded}` }))).toEqual([]);
        const bare = "const m = process.env.DEBUG;";
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${bare}` }));
        expect(problems.join("\n")).toMatch(/process\.env/);
    });

    it("fails when the plan-document module is missing from the bundle", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": "export {};" }));
        expect(problems.join("\n")).toMatch(/openleague\.practice-plan/);
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
});
