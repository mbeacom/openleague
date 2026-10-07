import { describe, expect, it } from "vitest";
import { parseSnakeChart } from "@/lib/ratings/import";

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

    it("reports team numbers outside any labelled column", () => {
        const result = parseSnakeChart("Riverside\t901");
        expect(result.teams).toEqual([]);
        expect(result.unparsed).toEqual(["901"]);
    });
});
