import { describe, expect, it } from "vitest";
import { decodeEntities, defaultSeasonYear, htmlToText, parseSchedule } from "@/lib/ratings/import";

// Made-up programs in the token shapes the real schedule page produces (spec R6).
const PAGE_TEXT = [
    "Schedule", "Home", "Score", "Away", "Location",
    "9/20", "9:25am", "901 Riverside M1", "11", "-", "4", "902 Lakeview M2", "North Rink",
    "9/26", "3:40pm", "903 Hilltop M1", "4 - 9", "901 Riverside M1", "Center Ice",
    "9/26", "4:30pm", "902 Lakeview M2", "6", "-", "5", "903 Hilltop M1", "Center Ice",
    "10/12", "8:00am", "901 Riverside M1", "vs", "903 Hilltop M1", "The Pond",
    "10/12", "12:30pm", "902 Lakeview M2", "903 Hilltop M1",
    "904 Orphan Team",
].join("\n");

describe("parseSchedule", () => {
    it("reads completed and scheduled games from page text", () => {
        const result = parseSchedule(PAGE_TEXT, { seasonYear: 2026 });
        expect(result.games).toEqual([
            { date: "2026-09-20", time: "09:25", home: "901", away: "902", homeGoals: 11, awayGoals: 4, rink: "North Rink" },
            { date: "2026-09-26", time: "15:40", home: "903", away: "901", homeGoals: 4, awayGoals: 9, rink: "Center Ice" },
            { date: "2026-09-26", time: "16:30", home: "902", away: "903", homeGoals: 6, awayGoals: 5, rink: "Center Ice" },
            { date: "2026-10-12", time: "08:00", home: "901", away: "903", homeGoals: null, awayGoals: null, rink: "The Pond" },
            { date: "2026-10-12", time: "12:30", home: "902", away: "903", homeGoals: null, awayGoals: null, rink: null },
        ]);
        expect(result.teams).toEqual([
            { number: "901", name: "Riverside M1" },
            { number: "902", name: "Lakeview M2" },
            { number: "903", name: "Hilltop M1" },
        ]);
        expect(result.unparsed).toEqual(["904 Orphan Team"]);
    });

    it("reads tab-separated rows and combined date and time cells", () => {
        const result = parseSchedule("9/26 3:40pm\t903 Hilltop M1\t4 - 9\t901 Riverside M1\tCenter Ice", { seasonYear: 2026 });
        expect(result.games).toHaveLength(1);
        expect(result.games[0]).toMatchObject({ date: "2026-09-26", time: "15:40", homeGoals: 4, awayGoals: 9 });
    });

    it("reads a saved page's HTML, ignoring scripts and decoding entities", () => {
        const html =
            '<html><head><script>9/21\n9:25am\n901 Bad Team\n11 - 4\n902 Fake Team</script><style>.x{}</style></head><body>' +
            '<div class="game"><span>9/20</span><span>9:25am</span><a href="#">901 Riverside M1</a><b>11</b><b>-</b><b>4</b>' +
            '<a href="#">902 Lake &amp; View M2</a><span>North&nbsp;Rink</span></div></body></html>';
        const result = parseSchedule(html, { seasonYear: 2026 });
        expect(result.games).toHaveLength(1);
        expect(result.games[0].home).toBe("901");
        expect(result.games[0].away).toBe("902");
        expect(result.teams[1]).toEqual({ number: "902", name: "Lake & View M2" });
        expect(result.games[0].rink).toBe("North Rink");
    });

    it("puts January–June dates in the following calendar year", () => {
        const result = parseSchedule("1/5\n9:00am\n901 Riverside M1\n2 - 1\n902 Lakeview M2", { seasonYear: 2026 });
        expect(result.games[0].date).toBe("2027-01-05");
    });

    it("converts 12am and 12pm correctly", () => {
        const result = parseSchedule("9/1\n12:05am\n901 A\n1 - 0\n902 B\n9/1\n12:30pm\n901 A\n1 - 0\n902 B", { seasonYear: 2026 });
        expect(result.games.map((x) => x.time)).toEqual(["00:05", "12:30"]);
    });

    it("never invents a game without a date, or between a team and itself", () => {
        const result = parseSchedule("901 Riverside M1\n2 - 1\n902 Lakeview M2\n9/1\n901 A\n1 - 0\n901 A", { seasonYear: 2026 });
        expect(result.games).toHaveLength(0);
        expect(result.unparsed).toEqual(["901 Riverside M1", "902 Lakeview M2", "901 A"]);
    });

    it("resets time to null after each game, so later same-date games without time get null", () => {
        const result = parseSchedule("9/1\n9:00am\n901 A\n1 - 0\n902 B\n901 C\n2 - 1\n902 D", { seasonYear: 2026 });
        expect(result.games).toHaveLength(2);
        expect(result.games[0].time).toBe("09:00");
        expect(result.games[1].time).toBeNull();
    });

    it("rejects invalid calendar dates like 2/30 and 4/31", () => {
        const result = parseSchedule("2/30\n9:00am\n901 A\n1 - 0\n902 B\n4/31\n901 C\n2 - 1\n902 D", { seasonYear: 2026 });
        expect(result.games).toHaveLength(0);
        expect(result.unparsed).toEqual(["901 A", "902 B", "901 C", "902 D"]);
    });

    it("accepts em dash, minus sign, en dash, and hyphen as score separators", () => {
        const hyphen = parseSchedule("9/1\n901 A\n1 - 0\n902 B", { seasonYear: 2026 });
        const enDash = parseSchedule("9/1\n901 A\n1 – 0\n902 B", { seasonYear: 2026 });
        const emDash = parseSchedule("9/1\n901 A\n1 — 0\n902 B", { seasonYear: 2026 });
        const minusSign = parseSchedule("9/1\n901 A\n1 − 0\n902 B", { seasonYear: 2026 });
        expect(hyphen.games).toHaveLength(1);
        expect(enDash.games).toHaveLength(1);
        expect(emDash.games).toHaveLength(1);
        expect(minusSign.games).toHaveLength(1);
        expect(hyphen.games[0]).toMatchObject({ homeGoals: 1, awayGoals: 0 });
        expect(enDash.games[0]).toMatchObject({ homeGoals: 1, awayGoals: 0 });
        expect(emDash.games[0]).toMatchObject({ homeGoals: 1, awayGoals: 0 });
        expect(minusSign.games[0]).toMatchObject({ homeGoals: 1, awayGoals: 0 });
    });
});

describe("decodeEntities", () => {
    it("decodes named entities like &amp; and &nbsp;", () => {
        expect(decodeEntities("A&amp;B")).toBe("A&B");
        expect(decodeEntities("A&nbsp;B")).toBe("A B");
    });

    it("decodes decimal numeric entities like &#39;", () => {
        expect(decodeEntities("A&#39;B")).toBe("A'B");
    });

    it("decodes hex numeric entities like &#x27;", () => {
        expect(decodeEntities("A&#x27;B")).toBe("A'B");
    });

    it("leaves invalid numeric entities unchanged like &#0;", () => {
        expect(decodeEntities("A&#0;B")).toBe("A&#0;B");
    });

    it("leaves unknown named entities unchanged like &bogus;", () => {
        expect(decodeEntities("A&bogus;B")).toBe("A&bogus;B");
    });
});

describe("htmlToText", () => {
    it("puts every element's text on its own line", () => {
        expect(htmlToText("<p>a<b>b</b></p><!-- c --><br>d").split("\n")).toEqual(["a", "b", "d"]);
    });
});

describe("defaultSeasonYear", () => {
    it("is this year from July on, else last year", () => {
        expect(defaultSeasonYear(new Date(2026, 9, 7))).toBe(2026);
        expect(defaultSeasonYear(new Date(2027, 1, 7))).toBe(2026);
    });
});
