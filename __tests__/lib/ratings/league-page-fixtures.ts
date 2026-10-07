/**
 * Made-up league pages (spec R6: never real league data) in the shapes real league sites
 * produce. The schedule is Bootstrap `div` rows, not a table; its plain-text copy is what a
 * browser's Select All + Copy yields (Selection.toString()), which runs neighbouring cells
 * together: the time into the home team, the away team into the rink, and an unplayed
 * game's whole row into one line. The snake chart has one table per age division.
 */

interface FixtureGame {
    date: string;
    time: string;
    home: string;
    away: string;
    score: string | null;
    rink: string;
}

const GAMES: FixtureGame[] = [
    { date: "9/18", time: "5:40pm", home: "901 Riverside Red 1", away: "902 Lakeview M1", score: "5 - 3", rink: "Rink A" },
    // 905 is only ever an away team: its name can only come from a known rink.
    { date: "9/19", time: "8:00am", home: "903 Hilltop M3 - Blue", away: "905 Pinewood M2", score: "2 - 4", rink: "Rink B" },
    { date: "9/19", time: "9:10am", home: "902 Lakeview M1", away: "904 Brookside M1", score: "1 - 1", rink: "Rink A" },
    { date: "9/20", time: "7:30am", home: "904 Brookside M1", away: "901 Riverside Red 1", score: "0 - 6", rink: "Rink B" },
    // A home name ending in a digit runs into the away number: "Red 1903 Hilltop".
    { date: "10/3", time: "6:10pm", home: "901 Riverside Red 1", away: "903 Hilltop M3 - Blue", score: null, rink: "Rink A" },
    { date: "10/4", time: "8:00am", home: "902 Lakeview M1", away: "905 Pinewood M2", score: null, rink: "Rink B" },
    // 906 only plays unplayed games: its name comes from splitting the one-line row.
    { date: "10/4", time: "9:15am", home: "906 Riverside M2", away: "904 Brookside M1", score: null, rink: "Rink A" },
];

const FOOTER_ADDRESS = "950 W. 1st Street";

const logo = '<div class="col-xs-1 hidden-xs"><img src="logo.png" alt=""></div>';

export const SCHEDULE_HTML = [
    "<!DOCTYPE html><html><head><title>Schedule</title><script>var games = '9/1 901 Fake Team';</script></head><body>",
    '<nav><a href="#">SCHEDULE</a><a href="#">STANDINGS</a></nav><h4>8U PRE-SEASON SCHEDULE</h4>',
    ...GAMES.map(
        (g) =>
            `<div class="row"><div class="col-xs-2"><strong>${g.date}</strong><br>${g.time}</div>` +
            `<div class="col-xs-3"><a href="#">${g.home}</a></div>${logo}` +
            `<div class="col-xs-1">${g.score ? `<h3><nobr>${g.score}</nobr></h3>` : ""}</div>${logo}` +
            `<div class="col-xs-3"><a href="#">${g.away}</a></div><div class="col-xs-1">${g.rink}</div></div>`,
    ),
    `<footer><h4>CONTACT</h4><p>${FOOTER_ADDRESS}</p></footer></body></html>`,
].join("\n");

/** Selection.toString() of the page above: block boundaries become newlines, inline cells don't. */
export const SCHEDULE_COPIED = [
    "SCHEDULE",
    "STANDINGS",
    "8U PRE-SEASON SCHEDULE",
    "",
    ...GAMES.flatMap((g) => (g.score ? [g.date, `${g.time}${g.home}`, g.score, `${g.away}${g.rink}`] : [g.date, `${g.time}${g.home}${g.away}${g.rink}`])),
    "",
    "CONTACT",
    FOOTER_ADDRESS,
    "",
].join("\n");

export const SCHEDULE_EXPECTED = {
    games: 7,
    finals: 4,
    teams: [
        { number: "901", name: "Riverside Red 1" },
        { number: "902", name: "Lakeview M1" },
        { number: "903", name: "Hilltop M3 - Blue" },
        { number: "905", name: "Pinewood M2" },
        { number: "904", name: "Brookside M1" },
        { number: "906", name: "Riverside M2" },
    ],
    rinks: GAMES.map((g) => g.rink),
    unparsed: [FOOTER_ADDRESS],
};

const header = (division: string, colours: string[], strengths: string[]) =>
    `<table class="snake"><thead><tr><th>${division}</th>${colours.map((_, k) => `<th>${k + 1}</th>`).join("")}<th>Teams</th></tr>` +
    `<tr><th>Program</th>${colours.map((c) => `<th>${c}</th>`).join("")}<th rowspan="2">Total</th></tr>` +
    `<tr><th>Strength</th>${strengths.map((s) => `<th>${s}</th>`).join("")}</tr></thead><tbody>`;
const cell = (number?: string, name?: string) => (number ? `<td class="n" title="${name}">${number}</td>` : "<td></td>");

/** Two age divisions, each its own table; programs with a second row use rowspan. */
export const SNAKE_HTML = [
    "<html><body><h1>Snake charts</h1><h2>8U Snake Chart</h2>",
    header("8U 901 et al.", ["Red", "Red", "White", "White"], ["str", "weak", "str", "weak"]),
    `<tr><th rowspan="2" title="Riverside">Riverside</th>${cell("901", "Riverside Red 1")}${cell()}${cell("906", "Riverside M2")}${cell()}<td rowspan="2">3</td></tr>`,
    `<tr>${cell()}${cell()}${cell("907", "Riverside M3")}${cell()}</tr>`,
    `<tr><th rowspan="2">Lakeview</th>${cell()}${cell("902", "Lakeview M1")}${cell()}${cell("903", "Hilltop M3 - Blue")}<td rowspan="2">3</td></tr>`,
    `<tr>${cell("904", "Brookside M1")}${cell()}${cell()}${cell("905", "Pinewood M2")}</tr>`,
    `<tr><th rowspan="2">Hilltop</th>${cell()}${cell()}${cell()}${cell("908", "Hilltop M4")}<td rowspan="2">2</td></tr>`,
    `<tr>${cell()}${cell()}${cell()}${cell("909", "Hilltop M5")}</tr>`,
    "<tr><th>Total 8U</th><td>9</td></tr></tbody></table>",
    "<h2>10U Snake Chart</h2>",
    header("10U 951 et al.", ["AA", "AA", "A1", "A1"], ["str", "weak", "str", "weak"]),
    `<tr><th>Brookside</th>${cell("951", "Brookside S1")}${cell()}${cell("953", "Brookside S2")}${cell()}<td>2</td></tr>`,
    `<tr><th>Pinewood</th>${cell()}${cell("952", "Pinewood S1")}${cell()}${cell("954", "Pinewood S2")}<td>2</td></tr>`,
    "<tr><th>Total 10U</th><td>4</td></tr></tbody></table></body></html>",
].join("\n");

/**
 * Its copy: the page's CSS uppercases the program colours, and a continuation row loses the
 * empty cells that lead it ("907\t" is in the third of four columns, "909" in the fourth).
 */
export const SNAKE_COPIED = [
    "Snake charts",
    "8U Snake Chart",
    "8U 901 et al.\t1\t2\t3\t4\tTeams",
    "PROGRAM\tRED\tRED\tWHITE\tWHITE\tTOTAL",
    "strength\tstr\tweak\tstr\tweak",
    "Riverside\t901\t\t906\t\t3",
    "907\t",
    "Lakeview\t\t902\t\t903\t3",
    "904\t\t\t905",
    "Hilltop\t\t\t\t908\t2",
    "909",
    "Total 8U\t9",
    "10U Snake Chart",
    "10U 951 et al.\t1\t2\t3\t4\tTeams",
    "PROGRAM\tAA\tAA\tA1\tA1\tTOTAL",
    "strength\tstr\tweak\tstr\tweak",
    "Brookside\t951\t\t953\t\t2",
    "Pinewood\t\t952\t\t954\t2",
    "Total 10U\t4",
].join("\n");

export const SNAKE_8U_EXPECTED = [
    "901:Red Strong",
    "902:Red Weak",
    "903:White Weak",
    "904:Red Strong",
    "905:White Weak",
    "906:White Strong",
    "907:White Strong",
    "908:White Weak",
    "909:White Weak",
];
