/** renderBenchSheetHtml: one offline file, escaped, no scripts, no requests, two drills per page. */
import { describe, expect, it } from "vitest";
import { EXPORT_CSP, escapeHtml, renderBenchSheetHtml } from "@/components/features/practice-planner/export/bench-sheet-html";
import type { BenchSheetModel } from "@/components/features/practice-planner/export/bench-sheet-model";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function drill(number: number, extra: Partial<BenchSheetModel["drills"][number]> = {}): BenchSheetModel["drills"][number] {
    return { number, name: `Drill ${number}`, start: "6:00 PM", minutes: 10, station: null, diagram: PNG, text: null, equipment: null, ...extra };
}

const MODEL: BenchSheetModel = {
    title: "Tuesday Skills",
    teamName: "Hawks U12",
    when: "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT",
    place: "Ice House · Rink A",
    gap: null,
    staff: null,
    roster: null,
    rosterPlayers: [],
    mark: null,
    timeline: [
        { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] },
        { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null },
    ],
    planned: "Planned 25 of 60 min",
    overTime: false,
    equipment: [],
    legend: [{ label: "Pass", image: PNG }],
    drills: [drill(1, { station: "Station 1 of 2", text: "Hard to the net" }), drill(2), drill(3)],
};

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("escapeHtml", () => {
    it("escapes the five significant characters", () => {
        expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    });
});

describe("renderBenchSheetHtml", () => {
    it("renders the header, timeline, legend and drills", () => {
        const doc = parse(renderBenchSheetHtml(MODEL));
        expect(doc.title).toBe("Tuesday Skills · Bench sheet");
        expect(doc.querySelector("h1")?.textContent).toBe("Tuesday Skills");
        expect(doc.querySelector(".team")?.textContent).toBe("Hawks U12");
        expect(doc.querySelector(".when")?.textContent).toBe(MODEL.when);
        expect(doc.querySelector(".place")?.textContent).toBe("Ice House · Rink A");
        const rows = Array.from(doc.querySelectorAll(".timeline tbody tr"));
        expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(["6:00 PM MDT", "6:10 PM MDT"]);
        expect(Array.from(rows[0].querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Breakout · 10 min", "Regroup · 8 min"]);
        expect(doc.querySelector(".planned")?.textContent).toBe("Planned 25 of 60 min");
        expect(doc.querySelector(".legend li")?.textContent?.trim()).toBe("Pass");
        expect(Array.from(doc.querySelectorAll("article.drill h2")).map((h) => h.textContent)).toEqual(["1. Drill 1", "2. Drill 2", "3. Drill 3"]);
        expect(doc.querySelector("article.drill .tag")?.textContent).toBe("Station 1 of 2");
        expect(doc.querySelector("article.drill .text")?.textContent).toBe("Hard to the net");
    });

    it("pairs drills into pages that each start a new page, inline so Docs and Word keep it", () => {
        const doc = parse(renderBenchSheetHtml(MODEL));
        const pages = Array.from(doc.querySelectorAll(".drills > .page"));
        expect(pages.map((page) => page.querySelectorAll("article.drill").length)).toEqual([2, 1]);
        for (const page of pages) expect(page.getAttribute("style")).toContain("page-break-before:always");
    });

    it("sizes the diagram to fit Word's Letter text column if the stylesheet is dropped, keeping the 720:306 aspect", () => {
        const img = parse(renderBenchSheetHtml(MODEL)).querySelector("img.diagram");
        expect(img?.getAttribute("width")).toBe("624");
        expect(img?.getAttribute("height")).toBe("265");
    });

    it("marks an over-time plan", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, overTime: true }));
        expect(doc.querySelector(".planned")?.classList.contains("over")).toBe(true);
    });

    it("escapes every user string, so nothing in a plan can become markup", () => {
        const evil = `</title><script>alert("x")</script><img src=x onerror=alert(1)>`;
        const html = renderBenchSheetHtml({
            ...MODEL,
            title: evil,
            teamName: `O'Neil & Sons`,
            place: evil,
            timeline: [{ start: "6:00 PM", minutes: 10, label: evil, stations: [evil] }],
            legend: [{ label: evil, image: PNG }],
            drills: [drill(1, { name: evil, station: evil, text: evil })],
        });
        const doc = parse(html);
        expect(doc.querySelectorAll("script")).toHaveLength(0);
        expect(doc.querySelectorAll("img:not([src^='data:image/png;base64,'])")).toHaveLength(0);
        expect(doc.querySelector("h1")?.textContent).toBe(evil);
        expect(doc.querySelector("article.drill img")?.getAttribute("alt")).toBe(`Diagram: ${evil}`);
        expect(html).toContain("O&#39;Neil &amp; Sons");
        expect(html).not.toMatch(/<script/i);
    });

    it("keeps line breaks in drill text, including Windows ones", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, drills: [drill(1, { text: "One\r\nTwo\nThree" })] }));
        const text = doc.querySelector("article.drill .text");
        expect(text?.querySelectorAll("br")).toHaveLength(2);
        expect(text?.textContent).toBe("OneTwoThree");
    });

    it("loads nothing and runs nothing", () => {
        const html = renderBenchSheetHtml(MODEL);
        for (const banned of ["<script", "<link", "@import", "url(", "href="]) expect(html).not.toContain(banned);
        for (const [, src] of html.matchAll(/src="([^"]*)"/g)) expect(src.startsWith("data:image/png;base64,")).toBe(true);
        const csp = parse(html).querySelector('meta[http-equiv="Content-Security-Policy"]');
        expect(csp?.getAttribute("content")).toBe(EXPORT_CSP);
        expect(EXPORT_CSP).toContain("default-src 'none'");
    });

    it.each([null, "data:,", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"])(
        "shows Diagram unavailable for the image %j",
        (diagram) => {
            const doc = parse(renderBenchSheetHtml({ ...MODEL, drills: [drill(1, { diagram })] }));
            expect(doc.querySelector("article.drill img")).toBeNull();
            expect(doc.querySelector("article.drill .unavailable")?.textContent).toBe("Diagram unavailable");
        },
    );

    it("omits the team, place and legend when absent", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, teamName: null, place: null, legend: [] }));
        expect(doc.querySelector(".team")).toBeNull();
        expect(doc.querySelector(".place")).toBeNull();
        expect(doc.querySelector(".legend")).toBeNull();
    });

    it("says No drills planned for an empty session", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, timeline: [], legend: [], drills: [] }));
        expect(doc.querySelector(".empty")?.textContent).toBe("No drills planned");
        expect(doc.querySelector("table")).toBeNull();
    });
});

describe("renderBenchSheetHtml against hostile plans", () => {
    const HOSTILE = [
        `</style><script>alert(1)</script>`,
        `" onerror="x`,
        `' onload='x`,
        `javascript:alert(1)`,
        `<svg onload=alert(1)>`,
        `</title><meta http-equiv="refresh" content="0;url=https://evil.example">`,
        `--><!--`,
    ];

    function hostileModel(evil: string): BenchSheetModel {
        return {
            ...MODEL,
            title: evil,
            teamName: evil,
            when: evil,
            place: evil,
            planned: evil,
            timeline: [{ start: evil, minutes: 10, label: evil, stations: [evil, evil] }],
            legend: [{ label: evil, image: PNG }, { label: evil, image: `${PNG}" onerror="x` }],
            drills: [drill(1, { name: evil, start: evil, station: evil, text: `${evil}\n${evil}` }), drill(2, { name: evil, diagram: evil })],
        };
    }

    it.each(HOSTILE)("keeps %j as inert text everywhere", (evil) => {
        const html = renderBenchSheetHtml(hostileModel(evil));
        const doc = parse(html);
        expect(doc.querySelectorAll("script, link, iframe, object, embed, svg, base, form")).toHaveLength(0);
        expect(doc.querySelectorAll("meta")).toHaveLength(4);
        for (const el of Array.from(doc.querySelectorAll("*"))) {
            for (const attr of Array.from(el.attributes)) expect(attr.name.startsWith("on")).toBe(false);
        }
        for (const img of Array.from(doc.querySelectorAll("img"))) expect(img.getAttribute("src")).toBe(PNG);
        expect(doc.querySelectorAll("style")).toHaveLength(1);
        expect(doc.querySelector("style")?.textContent).not.toContain(evil);
        expect(doc.title).toBe(`${evil} · Bench sheet`);
        expect(doc.querySelector("h1")?.textContent).toBe(evil);
        expect(doc.querySelector(".team")?.textContent).toBe(evil);
        expect(doc.querySelector(".place")?.textContent).toBe(evil);
        expect(doc.querySelector(".planned")?.textContent).toBe(evil);
        expect(Array.from(doc.querySelectorAll("article.drill h2")).map((h) => h.textContent)).toEqual([`1. ${evil}`, `2. ${evil}`]);
        expect(doc.querySelector("article.drill .tag")?.textContent).toBe(evil);
        expect(doc.querySelector("article.drill .text")?.textContent).toBe(`${evil}${evil}`);
        expect(doc.querySelector("article.drill img")?.getAttribute("alt")).toBe(`Diagram: ${evil}`);
        expect(doc.querySelectorAll("article.drill .unavailable")).toHaveLength(1);
        expect(doc.querySelectorAll(".legend img")).toHaveLength(1);
        expect(html).not.toMatch(/<script/i);
    });
});

describe("renderBenchSheetHtml: block rows", () => {
    it("prints a block as its label and note on one line, escaped", () => {
        const doc = parse(renderBenchSheetHtml({
            ...MODEL,
            timeline: [{ kind: "block", start: "5:50 PM", minutes: 8, label: "Warm-up <fast>", note: "Laps & stretch", stations: null }, ...MODEL.timeline],
        }));
        const first = doc.querySelectorAll("tbody tr")[0];
        expect(first.textContent).toContain("Warm-up <fast> · Laps & stretch");
        expect(first.querySelector("ul")).toBeNull();
    });

    it("prints the timeline for a practice with only blocks", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, legend: [], drills: [], timeline: [{ kind: "block", start: "6:00 PM", minutes: 5, label: "Cool-down", note: null, stations: null }] }));
        expect(doc.querySelector(".empty")).toBeNull();
        expect(doc.querySelector("table")?.textContent).toContain("Cool-down");
    });
});

describe("renderBenchSheetHtml: rotation and the gap (spec R10)", () => {
    const ROTATION = {
        kind: "rotation" as const,
        start: "6:00 PM",
        minutes: 10,
        label: "Stations · rotate every 5 min · 10 min",
        stations: ["Goalie <G> · stays", "Skate A", "Skate B"],
        grid: {
            columns: ["Goalie <G>", "Skate A", "Skate B"],
            rows: [
                { start: "6:00 PM", cells: ["all", "A", "B"] },
                { start: "6:05 PM", cells: ["all", "B", "A"] },
            ],
        },
    };

    it("says the gap in the header", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, gap: "2 min between blocks" }));
        expect(doc.querySelector("header .gap")?.textContent).toBe("2 min between blocks");
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector("header .gap")).toBeNull();
    });

    it("prints a rotation block's header, its stations and its grid as a table, every name escaped", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, timeline: [ROTATION] }));
        const cell = doc.querySelector("tbody td:nth-child(3)");
        expect(cell?.querySelector("strong")?.textContent).toBe("Stations · rotate every 5 min · 10 min");
        expect([...(cell?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["Goalie <G> · stays", "Skate A", "Skate B"]);
        const grid = cell?.querySelector("table.rotation");
        expect([...(grid?.querySelectorAll("tr") ?? [])].map((tr) => tr.textContent)).toEqual([
            "StartGoalie <G>Skate ASkate B",
            "6:00 PMallAB",
            "6:05 PMallBA",
        ]);
        expect(doc.querySelector("g")).toBeNull();
        // A round's start time never wraps.
        expect(doc.querySelector("style")?.textContent).toMatch(/\.rotation \.time\s*\{\s*white-space:\s*nowrap;/);
    });
});

describe("renderBenchSheetHtml: practice roster (roster spec R15)", () => {
    it("prints the counts and each position's players, escaped, and nothing without a roster", () => {
        const out = renderBenchSheetHtml({ ...MODEL, roster: "Roster: 2 skaters · 1 goalie", rosterPlayers: ["Skater: #7 <Alex> & Co", "Goalie: Pat"] });
        const doc = parse(out);
        expect(doc.querySelector(".roster")?.textContent).toBe("Roster: 2 skaters · 1 goalie");
        expect(Array.from(doc.querySelectorAll(".roster-players")).map((p) => p.textContent)).toEqual(["Skater: #7 <Alex> & Co", "Goalie: Pat"]);
        expect(out).toContain("#7 &lt;Alex&gt; &amp; Co");
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector(".roster")).toBeNull();
    });
});

describe("renderBenchSheetHtml: practice staff (spec R9)", () => {
    it("prints the staff line and each row's names, escaped", () => {
        const out = renderBenchSheetHtml({
            ...MODEL,
            staff: "Staff: <Coach> & Sam",
            timeline: [
                { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min · run by <Sam>", "Regroup · 8 min"] },
                { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null, runBy: "run by <Sam>" },
                { kind: "block", start: "6:25 PM MDT", minutes: 2, label: "Water", note: "Fill up", stations: null, runBy: "run by Coach Lee" },
            ],
        });
        const doc = parse(out);
        expect(doc.querySelector(".staff")?.textContent).toBe("Staff: <Coach> & Sam");
        // Plain, like the place and gap lines and the live bench sheet.
        expect(doc.querySelector("style")?.textContent).not.toMatch(/\.staff\s*\{/);
        expect(out).toContain("Staff: &lt;Coach&gt; &amp; Sam");
        const rows = Array.from(doc.querySelectorAll(".timeline tbody tr"));
        expect(rows[0].querySelector("li")?.textContent).toBe("Breakout · 10 min · run by <Sam>");
        expect(rows[1].querySelectorAll("td")[2].textContent).toBe("Shooting · run by <Sam>");
        expect(rows[2].querySelectorAll("td")[2].textContent).toBe("Water · Fill up · run by Coach Lee");
        expect(out).not.toContain("<Sam>");
    });

    it("prints no staff line when there is none", () => {
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector(".staff")).toBeNull();
    });
});

describe("renderBenchSheetHtml: the team mark (practice logo spec R5)", () => {
    const withMark = (mark: BenchSheetModel["mark"]) => renderBenchSheetHtml({ ...MODEL, mark });

    it("puts the mark in the title with its size and escaped alt text, inside the unchanged CSP", () => {
        const html = withMark({ image: PNG, width: 96, height: 48, alt: `Hawks <U12> & "Co" logo` });
        const img = parse(html).querySelector("h1 img.mark");
        expect(img?.getAttribute("src")).toBe(PNG);
        expect([img?.getAttribute("width"), img?.getAttribute("height")]).toEqual(["96", "48"]);
        expect(img?.getAttribute("alt")).toBe(`Hawks <U12> & "Co" logo`);
        expect(html).toContain('alt="Hawks &lt;U12&gt; &amp; &quot;Co&quot; logo"');
        expect(html).toContain(`content="${EXPORT_CSP}"`);
        expect(EXPORT_CSP).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    });

    it("leaves out a mark whose image isn't a PNG data URI, and shows none without a mark", () => {
        expect(parse(withMark({ image: "https://example.com/a.png", width: 48, height: 48, alt: "x logo" })).querySelector("img.mark")).toBeNull();
        expect(parse(withMark(null)).querySelector("img.mark")).toBeNull();
    });
});

describe("renderBenchSheetHtml: equipment (practice equipment spec R5)", () => {
    const equipped: BenchSheetModel = {
        ...MODEL,
        equipment: ["Cones ×12", "Net ×1", "<Water> bottles ×20"],
        drills: [drill(1, { equipment: "Equipment: Cones ×6 · <Net> ×1" }), drill(2)],
    };

    it("lists the practice's equipment after the timeline and before the legend, escaped", () => {
        const out = renderBenchSheetHtml(equipped);
        const doc = parse(out);
        const items = [...doc.querySelectorAll("section.equipment li")].map((li) => li.textContent);
        expect(doc.querySelector("section.equipment h2")?.textContent).toBe("Equipment");
        expect(items).toEqual(["Cones ×12", "Net ×1", "<Water> bottles ×20"]);
        expect(out.indexOf('class="timeline"')).toBeLessThan(out.indexOf('class="equipment"'));
        expect(out.indexOf('class="equipment"')).toBeLessThan(out.indexOf('class="legend"'));
        expect(out).not.toContain("<Water>");
    });

    it("keeps the practice equipment when there are no timeline rows", () => {
        const doc = parse(renderBenchSheetHtml({ ...equipped, timeline: [], legend: [], drills: [] }));
        expect(doc.querySelector(".empty")?.textContent).toBe("No drills planned");
        expect([...doc.querySelectorAll("section.equipment li")].map((li) => li.textContent)).toEqual(["Cones ×12", "Net ×1", "<Water> bottles ×20"]);
    });

    it("prints each drill's own line, and nothing for a drill without equipment", () => {
        const doc = parse(renderBenchSheetHtml(equipped));
        const lines = [...doc.querySelectorAll("article.drill")].map((article) => article.querySelector(".equipment-line")?.textContent ?? null);
        expect(lines).toEqual(["Equipment: Cones ×6 · <Net> ×1", null]);
    });

    it("leaves the section out when the practice needs nothing", () => {
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector("section.equipment")).toBeNull();
    });
});
