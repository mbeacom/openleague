/**
 * The bench sheet as one self-contained HTML file (sub-project 4): inline CSS,
 * PNG data-URI images, no script and no external request, so it opens offline
 * in any browser and imports into Google Docs. Layout rides on plain elements
 * and inline page breaks, which Docs and Word keep when they drop <style>.
 *
 * Safety: every interpolated value goes through escapeHtml unless this module
 * itself wrapped it as Trusted; image sources must pass isPngDataUri. The CSP
 * meta is defense in depth: even an escaping bug could not run or load anything.
 */
import type { BenchSheetDrillItem, BenchSheetModel } from "./bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, LEGEND_HEADING, NO_DRILLS_TEXT } from "./labels";
import { isPngDataUri } from "./png";

export const EXPORT_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const DRILLS_PER_PAGE = 2;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text made safe for element content and quoted attribute values. */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Markup this module produced: the only value `html` inserts unescaped. Never build one from input. */
class Trusted {
    constructor(readonly value: string) {}
}

type Part = string | number | Trusted | null | undefined | false | readonly Part[];

function emit(part: Part): string {
    if (part === null || part === undefined || part === false) return "";
    if (part instanceof Trusted) return part.value;
    if (typeof part === "string" || typeof part === "number") return escapeHtml(String(part));
    return part.map(emit).join("");
}

/** Escape-by-default template. */
function html(strings: TemplateStringsArray, ...parts: Part[]): Trusted {
    let out = strings[0];
    parts.forEach((part, index) => {
        out += emit(part) + strings[index + 1];
    });
    return new Trusted(out);
}

/** Escaped text with its line breaks as <br> (Docs and Word ignore white-space: pre-wrap). */
function multiline(text: string): Trusted {
    return new Trusted(text.split(/\r?\n/).map(escapeHtml).join("<br>"));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** "Digital Playbook" on paper. Fonts are named, never fetched. */
const STYLES = new Trusted(`
@page { margin: 12mm; }
html { background: #fff; }
body { margin: 0; color: #111; background: #fff; font: 11pt/1.4 "Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif; }
.sheet { max-width: 190mm; margin: 0 auto; padding: 12mm 4mm; }
h1, h2 { color: #0D47A1; line-height: 1.15; margin: 0 0 4px; }
h1 { font-size: 24pt; font-weight: 900; letter-spacing: -0.01em; }
h2 { font-size: 13pt; font-weight: 800; }
header { border-bottom: 3px solid #1976D2; padding-bottom: 8px; margin-bottom: 12px; }
header p { margin: 2px 0; }
.team { font-weight: 700; }
table { width: 100%; border-collapse: collapse; border: 1px solid #90A4AE; font-size: 10pt; }
th, td { border: 1px solid #90A4AE; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #E3F2FD; color: #0D47A1; }
.time, .meta { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; }
td ul { margin: 2px 0 0; padding-left: 1.1em; }
.planned { margin: 6px 0 0; }
.planned.over { font-weight: 700; color: #C62828; }
.legend { margin-top: 14px; }
.legend ul { list-style: none; margin: 0; padding: 0; columns: 3 150px; }
.legend li { margin: 2px 0; break-inside: avoid; }
.legend img { vertical-align: middle; margin-right: 6px; }
.drill { break-inside: avoid; page-break-inside: avoid; margin: 0 0 14px; }
.meta { margin: 0 0 6px; font-size: 10pt; }
.tag { font-family: "Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif; font-weight: 700; border: 1px solid #111; padding: 0 4px; margin-left: 6px; }
.diagram { display: block; width: 100%; height: auto; border: 1px solid #CFD8DC; }
.unavailable { border: 1px dashed #999; color: #555; text-align: center; padding: 18% 0; margin: 0; }
.text { margin: 6px 0 0; }
.empty { font-weight: 700; }
@media screen { .page { border-top: 1px dashed #B0BEC5; margin-top: 16px; padding-top: 12px; } }
@media print { .sheet { max-width: none; padding: 0; } .diagram { max-height: 85mm; width: auto; max-width: 100%; } }
`);

function header(model: BenchSheetModel): Trusted {
    return html`<header>
<h1>${model.title}</h1>
${model.teamName ? html`<p class="team">${model.teamName}</p>` : null}
<p class="when">${model.when}</p>
${model.place ? html`<p class="place">${model.place}</p>` : null}
</header>`;
}

function timeline(model: BenchSheetModel): Trusted {
    const rows = model.timeline.map(
        (row) =>
            html`<tr><td class="time">${row.start}</td><td>${row.minutes}</td><td>${
                row.stations ? html`<strong>${row.label}</strong><ul>${row.stations.map((station) => html`<li>${station}</li>`)}</ul>` : row.label
            }</td></tr>
`,
    );
    return html`<section class="timeline">
<table border="1" cellpadding="4" cellspacing="0">
<thead><tr><th scope="col">Start</th><th scope="col">Min</th><th scope="col">Drill</th></tr></thead>
<tbody>
${rows}</tbody>
</table>
<p class="${model.overTime ? "planned over" : "planned"}">${model.planned}</p>
</section>`;
}

function legend(model: BenchSheetModel): Trusted | null {
    if (model.legend.length === 0) return null;
    const items = model.legend.map(
        (entry) => html`<li>${isPngDataUri(entry.image) ? html`<img src="${entry.image}" width="40" height="20" alt="">` : null}${entry.label}</li>`,
    );
    return html`<section class="legend">
<h2>${LEGEND_HEADING}</h2>
<ul>${items}</ul>
</section>`;
}

function drill(item: BenchSheetDrillItem): Trusted {
    const diagram = isPngDataUri(item.diagram)
        ? html`<img class="diagram" src="${item.diagram}" width="720" height="306" alt="${`Diagram: ${item.name}`}">`
        : html`<p class="unavailable">${DIAGRAM_UNAVAILABLE_TEXT}</p>`;
    return html`<article class="drill">
<h2>${item.number}. ${item.name}</h2>
<p class="meta">${item.start} · ${item.minutes} min${item.station ? html` <span class="tag">${item.station}</span>` : null}</p>
${diagram}
${item.text ? html`<p class="text">${multiline(item.text)}</p>` : null}
</article>
`;
}

function drills(model: BenchSheetModel): Trusted {
    const pages = chunk(model.drills, DRILLS_PER_PAGE).map(
        (page) => html`<div class="page" style="page-break-before:always;break-before:page">
${page.map(drill)}</div>
`,
    );
    return html`<section class="drills">
${pages}</section>`;
}

export function renderBenchSheetHtml(model: BenchSheetModel): string {
    const body =
        model.drills.length === 0
            ? html`<p class="empty">${NO_DRILLS_TEXT}</p>`
            : html`${timeline(model)}
${legend(model)}
${drills(model)}`;
    return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${new Trusted(EXPORT_CSP)}">
<meta name="generator" content="OpenLeague">
<title>${model.title} · Bench sheet</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet">
${header(model)}
${body}
</main>
</body>
</html>
`.value;
}
