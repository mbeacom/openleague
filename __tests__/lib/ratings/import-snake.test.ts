import { describe, expect, it } from "vitest";
import { parseSnakeChart } from "@/lib/ratings/import";
import { SNAKE_8U_EXPECTED, SNAKE_COPIED, SNAKE_HTML } from "./league-page-fixtures";

const HTML = `
<h2>8U Snake Chart</h2>
<table><thead>
<tr><th>8U</th><th>1</th><th>2</th><th>3</th><th>4</th><th>Teams</th></tr>
<tr><th>Program</th><th>Red</th><th>Red</th><th>White</th><th>White</th><th rowspan="2">Total</th></tr>
<tr><th>Strength</th><th>str</th><th>weak</th><th>str</th><th>weak</th></tr>
</thead><tbody>
<tr><th rowspan="2" title="Riverside Hawks">Riverside</th><td class="n" title="Riverside M1">901</td><td></td><td class="n" title="Riverside M2">903</td><td></td><td class="total" rowspan="2">3</td></tr>
<tr><td></td><td></td><td></td><td class="n" title="Riverside M3">905</td></tr>
<tr><th title="Lakeview">Lakeview</th><td></td><td class="n" title="Lakeview M1">902</td><td></td><td class="n" title="Lakeview M2">904</td><td class="total">2</td></tr>
</tbody></table>`;

const TEXT = ["Program\tRed\tRed\tWhite\tWhite\tTotal", "Strength\tstr\tweak\tstr\tweak", "Riverside\t901\t\t903\t\t3", "\t\t\t\t905", "Lakeview\t\t902\t\t904\t2"].join("\n");

const byNumber = <T extends { number: string }>(teams: T[]) => [...teams].sort((a, b) => a.number.localeCompare(b.number));

describe("parseSnakeChart", () => {
    it("reads brackets and names from the table HTML, including continuation rows", () => {
        expect(byNumber(parseSnakeChart(HTML).teams)).toEqual([
            { number: "901", name: "Riverside M1", startingBracket: "Red Strong" },
            { number: "902", name: "Lakeview M1", startingBracket: "Red Weak" },
            { number: "903", name: "Riverside M2", startingBracket: "White Strong" },
            { number: "904", name: "Lakeview M2", startingBracket: "White Weak" },
            { number: "905", name: "Riverside M3", startingBracket: "White Weak" },
        ]);
    });

    it("reads a tab-separated paste of the same table", () => {
        const teams = byNumber(parseSnakeChart(TEXT).teams);
        expect(teams.map((t) => `${t.number}:${t.startingBracket}`)).toEqual(["901:Red Strong", "902:Red Weak", "903:White Strong", "904:White Weak", "905:White Weak"]);
        expect(teams[0].name).toBeNull();
    });

    it("lists starting brackets in column order, not by team number", () => {
        expect(parseSnakeChart(HTML).brackets).toEqual(["Red Strong", "Red Weak", "White Strong", "White Weak"]);
        const reversed = ["Program\tWhite\tRed", "Strength\tstr\tstr", "Riverside\t901\t903", "Lakeview\t902\t904"].join("\n");
        expect(parseSnakeChart(reversed).brackets).toEqual(["White Strong", "Red Strong"]);
    });

    it("leaves out bracket columns with no teams", () => {
        expect(parseSnakeChart(["Program\tRed\tWhite", "Strength\tstr\tstr", "Riverside\t901\t"].join("\n")).brackets).toEqual(["Red Strong"]);
    });

    describe("a page with one table per age division", () => {
        const assignments = (teams: Array<{ number: string; startingBracket: string }>) => byNumber(teams).map((t) => `${t.number}:${t.startingBracket}`);

        it("scopes teams and brackets to the first division by default", () => {
            const chart = parseSnakeChart(SNAKE_HTML);
            expect(chart.divisions?.map((d) => d.name)).toEqual(["8U 901 et al.", "10U 951 et al."]);
            expect(chart.division).toBe(0);
            expect(assignments(chart.teams)).toEqual(SNAKE_8U_EXPECTED);
            expect(chart.brackets).toEqual(["Red Strong", "Red Weak", "White Strong", "White Weak"]);
        });

        it("reads a copy the same as the HTML: continuation rows, and uppercased colours", () => {
            const copied = parseSnakeChart(SNAKE_COPIED);
            const html = parseSnakeChart(SNAKE_HTML);
            expect(assignments(copied.teams)).toEqual(SNAKE_8U_EXPECTED);
            expect(copied.brackets).toEqual(html.brackets);
            expect(copied.divisions?.map((d) => assignments(d.teams))).toEqual(html.divisions?.map((d) => assignments(d.teams)));
            expect(copied.unparsed).toEqual([]);
        });

        it("reads an uppercased compound colour the same as the HTML's", () => {
            const html = `<table><tr><th>Program</th><th>Light Blue</th><th>AA</th><th>B</th></tr><tr><th>Strength</th><th>str</th><th>str</th><th>weak</th></tr><tr><th>Riverside</th><td>901</td><td>902</td><td>903</td></tr></table>`;
            const text = ["PROGRAM\tLIGHT BLUE\tAA\tB", "STRENGTH\tSTR\tSTR\tWEAK", "Riverside\t901\t902\t903"].join("\n");
            const brackets = ["Light Blue Strong", "AA Strong", "B Weak"];
            expect(parseSnakeChart(html).brackets).toEqual(brackets);
            expect(parseSnakeChart(text).brackets).toEqual(brackets);
            expect(parseSnakeChart(text).teams.map((t) => t.startingBracket)).toEqual(parseSnakeChart(html).teams.map((t) => t.startingBracket));
        });

        it("keeps short program names as written", () => {
            expect(parseSnakeChart(SNAKE_COPIED, { division: 1 }).brackets).toEqual(["AA Strong", "AA Weak", "A1 Strong", "A1 Weak"]);
        });

        it("picks the division holding the schedule's teams", () => {
            const chart = parseSnakeChart(SNAKE_COPIED, { scheduleTeams: ["952", "954", "901"] });
            expect(chart.division).toBe(1);
            expect(chart.teams.map((t) => t.number).sort()).toEqual(["951", "952", "953", "954"]);
        });

        it("uses the division the user picked", () => {
            expect(parseSnakeChart(SNAKE_HTML, { division: 1, scheduleTeams: ["901"] }).division).toBe(1);
            expect(parseSnakeChart(SNAKE_HTML, { division: 7 }).division).toBe(0);
        });
    });

    it("reports team numbers outside any labelled column", () => {
        const result = parseSnakeChart("Riverside\t901");
        expect(result.teams).toEqual([]);
        expect(result.brackets).toEqual([]);
        expect(result.unparsed).toEqual(["901"]);
    });
});
