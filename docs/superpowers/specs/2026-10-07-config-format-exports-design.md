# Config-format exports: plans and rankings as YAML, TOML or JSONC

Date: 2026-10-07
Status: implemented
Related: ADR-0020 (portable plan document), ADR-0022 (document envelope and storage connectors), [storage connectors spec](./2026-10-07-static-storage-connectors-design.md)

## Goal

Coaches share plans and rankings through OneDrive, Google Drive and similar
storage, and some prefer to read or hand-edit them as configuration files.
Practice plans and rankings can now be downloaded and opened as YAML, TOML or
JSONC as well as JSON. This applies to the hosted app (plan export and plan
import) and the static planner (plan export and import, rankings export and open).

## R1. One data model, several encodings

- The bare document (`openleague.practice-plan`, `openleague.rankings`) is the
  only data model. YAML, TOML and JSONC are encodings of it, nothing more: no
  format adds, renames or drops a field.
- JSON stays the default and the canonical form. "Download plan file" and
  "Export rankings file" still write JSON, byte for byte as before.
- Every format round-trips losslessly. Reading an encoded file gives the same
  parsed document as reading its JSON. Tests check this for a rich plan
  (stations with rotation, blocks, staff, diagrams with players, strokes,
  equipment, annotations and a custom ice area) and a rich rankings document
  (sources, excluded teams, scheduled games, null fields).

## R2. Files

| Format | Plan | Rankings | Media type |
|---|---|---|---|
| JSON (default) | `<slug>.olplan.json` | `<slug>.rankings.json` | `application/json` |
| YAML | `<slug>.olplan.yaml` | `<slug>.rankings.yaml` | `application/yaml` (RFC 9512) |
| TOML | `<slug>.olplan.toml` | `<slug>.rankings.toml` | `application/toml` |
| JSONC | `<slug>.olplan.jsonc` | `<slug>.rankings.jsonc` | `text/plain;charset=utf-8` |

- JSONC has no registered media type, and a file with comments is not valid
  `application/json`. It is saved as plain text so storage providers preview it.
  The reader never trusts the media type.
- `.yml` opens as YAML. File inputs accept all of these extensions and types
  (`DOCUMENT_FILE_ACCEPT`).
- These are the files the Drive and OneDrive connectors will save and open.
  A connector passes the remote file's name to `readAnyDocumentText`.

## R3. Detection on open

The extension decides first. If the name has no known extension (a cloud file,
a renamed download), the content decides:

1. `{`: JSON, or JSONC if it doesn't parse as JSON.
2. A leading `//` or `/*`: JSONC.
3. A first significant line (skipping `#` comments) that is a `[table]` header
   or `key = value`: TOML.
4. Anything else: YAML. It comes last because YAML accepts almost any text.

Whatever the format, the envelope reader trusts only the decoded content (`format`, `kind`).

## R4. Reading: one entry point

`readAnyDocumentText(text, fileName, source?, expect?)` in `lib/document-formats/`:

1. Size check: the raw text is held to the same limit `readDocumentText` uses
   (the kind's limit plus `ENVELOPE_OVERHEAD_BYTES`). Oversized text is refused
   before detection or parsing, and before any library loads. `readPlanFile` and
   `readRankingsFile` still refuse an oversized `File` without reading it.
2. JSON goes straight to `readDocumentText`, so existing behavior is unchanged,
   except that a number too large for a double (`1e999`) is refused (step 5).
3. Other formats are decoded to plain data, then re-serialized as compact JSON
   and handed to `readDocumentText`. The kind's own limit is therefore measured
   on canonical JSON, the form the hosted import sends to its server action
   (the reason `MAX_PLAN_FILE_BYTES` exists). Expanded YAML aliases are bounded
   twice: by the alias cap, then by this measurement.
4. `readPlanFile` and `readRankingsFile` call it, so the hosted plan import,
   the static plan import and the static rankings open accept every format
   with no change to their callers.
5. Every number in the decoded data must be finite. YAML `.nan` and `.inf`,
   TOML `nan` and `inf`, and an overflowing literal in any format would become
   `null` in JSON, silently changing the value, so the file is refused as
   `not-a-document` with a plain message.

Errors use the envelope's codes. A syntax error is `not-a-document` with a
plain message naming the format and line, such as "This TOML file has a typing
mistake on line 4 and can't be opened." It never quotes the file's content. A
file that parses but isn't the expected kind gets that kind's existing message.

## R5. YAML safety

The `yaml` package, parsed with:

- `version: "1.2"`, `schema: "core"`, `customTags: []` and
  `resolveKnownTags: false`. There are no custom, language or YAML 1.1 tags
  (`!!binary`, `!!timestamp`, `!!set`), so dates and times stay text.
- An unresolved tag is a warning, and any warning refuses the file.
- `merge: false`: `<<` is an ordinary key, which the schema strips. It never
  supplies fields.
- `uniqueKeys: true`: a duplicate key is an error.
- `maxAliasCount: 100`: a "billion laughs" alias bomb is refused with its own
  message.
- One document only: a second `---` document is an error.

When writing: `aliasDuplicateObjects: false` (no anchors are written) and
`lineWidth: 0` (no folding). The core schema quotes any string that would read
as another type, such as `"007"`, `"true"`, `"null"` or `"1e5"`.

## R6. TOML mapping

The `smol-toml` package.

- **Null.** TOML has no null. On write, a null is left out only at a path
  each kind's schema owns and reads as null when missing (`.nullish()`, or a
  `z.preprocess` that reads a missing key as its default). The writer keeps
  that list of paths per kind. The round-trip tests include those fields
  (`rotateEveryMinutes`, a block `label`, game `time`, `rink` and scores,
  `meta.source`, `lastReadAt`, `startingBracket`).
- **Any other null** has no TOML form: one inside a list, or one inside data
  a kind keeps as-is (the reserved rankings `snapshots`, a drill diagram),
  where nothing would restore it. The writer refuses such a document with
  "This file has empty values TOML can't keep, so it can't be saved as TOML.
  Download it as JSON instead." It never drops the value silently.
- **Mixed arrays.** TOML 1.0 allows them, and neither document has one.
- **Dates.** We always write quoted strings. A hand-typed TOML date
  (`date = 2026-10-07`) reads as its text.
- **Size.** The diagram data fits TOML as nested arrays of tables. It is
  correct but wordy (repeated `[[session.drills.drill.playData.players]]`
  headers), so a TOML plan is larger than its JSON. The size check in R4 holds
  every format to the same raw-text limit. If a TOML or YAML export would be
  too large to open again, the menu warns and points to JSON.

## R7. JSONC

The `jsonc-parser` package: comments and trailing commas are allowed. It
returns a partial value on errors, so any error refuses the file. When writing,
there are three `//` header lines: the kind, the version and the format, how to
open the file, and a note that `//` lines are ignored. Then the JSON.

YAML and TOML get the same header as `#` comments. A header never includes a
title, a name or any other data.

## R8. Envelope phase

All four formats write the bare document, following ADR-0022's phase rules
(nothing writes the wrapped form yet). The encoders and readers carry an
envelope unchanged, and the tests round-trip a wrapped plan in every format,
so the phase that writes envelopes needs no format work.

## R9. Lazy loading

`yaml`, `smol-toml` and `jsonc-parser` load only through `import()` inside
`lib/document-formats/codecs.ts`, when a file in that format is saved or
opened. JSON never loads them.

- `scripts/check-planner-build.ts` requires a literal unique to each library
  somewhere in the static bundle, and refuses it in the entry chunk.
- A unit test scans the app source for static imports of the libraries.
- `lib/document-formats/index.ts` is an entry of the ADR-0020 portability guard.

## R10. UI

- **Export plan menu (hosted and static).** "Download plan file" is still
  JSON. "Download plan file as YAML", "… as TOML" and "… as JSONC" follow it.
  These call the same download function with a format argument.
- **Static Rankings.** "Export rankings file" is still JSON. A "Download as…"
  menu next to it offers JSON, YAML, TOML and JSONC.
- **Import pages.** Plan import (hosted and static) and the rankings Open file
  accept every format, and the copy names the extensions.
- **Failures.** If a library fails to load (offline, or a redeploy replaced the
  chunk), the menu shows a notice suggesting JSON.

## R11. Privacy

The formats carry exactly what the JSON carries, so every rule about what an
export may contain still applies, including staff names (names only, never ids)
and any later opt-in for names. Each encoder takes the document after it has
been built. Headers contain no data. Error messages name only the format and a
line number.

## Dependencies

All are pinned through `bun.lock` (ADR-0005) with caret ranges, the repository's convention.

| Package | Version | License | Why |
|---|---|---|---|
| `yaml` (eemeli) | 2.9.1 | ISC | Maintained, spec-complete, with the core schema and alias limits. Moved from a devDependency to a dependency. |
| `smol-toml` | 1.9.0 | BSD-3-Clause | The maintained, dependency-free TOML 1.0 parser and serializer. BSD-3-Clause is permissive and compatible with Apache-2.0. The MIT and ISC alternatives are unmaintained or parse-only. |
| `jsonc-parser` (Microsoft) | 3.3.1 | MIT | The JSONC reader VS Code uses, with no dependencies. |

## Out of scope

- Writing the envelope (a later ADR-0022 phase).
- Remembering a coach's preferred format. JSON is the default every time.
- Format choice for the `#plan=` link, which stays JSON (ADR-0020).
