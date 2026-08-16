/**
 * Shared reading of the ADR corpus in `docs/adr/`.
 *
 * Both `check-adr-integrity.ts` and `check-adr-review-dates.ts` need the same
 * answer to "which files here are actually records?", and getting that wrong is
 * the easy bug in this directory -- `README.md` is prose, and `0000-template.md`
 * matches the record filename pattern but is deliberately excluded by adrkit.
 * Counting either as a record would let a wiped corpus pass the integrity gate
 * and would make the template itself show up as an expired decision.
 *
 * The frontmatter reader lives here too so there is exactly one of them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Files that live in the corpus directory but are not records. */
export const NON_RECORD_FILES = new Set(['README.md', '0000-template.md']);

/** adrkit's own discovery rule: four or more leading digits, then a kebab slug. */
export const RECORD_NAME = /^[0-9]{4,}-[a-z0-9-]+\.md$/;

/** Corpus location, relative to the repository root. */
export const CORPUS_DIR = path.join('docs', 'adr');

/** The frontmatter fields these checks read. Everything else is ignored. */
export interface RecordFrontmatter {
  id?: string;
  title?: string;
  status?: string;
  reviewBy?: string;
}

export interface AdrRecord extends RecordFrontmatter {
  /** Filename within the corpus directory, e.g. `0001-record-....md`. */
  file: string;
}

/**
 * `readdir` the corpus and return only the markdown entries. Returns `null`
 * when the directory itself is missing, which callers report differently from
 * an empty directory.
 */
export function listCorpusEntries(corpusDir: string): string[] | null {
  if (!existsSync(corpusDir)) return null;
  return readdirSync(corpusDir).filter((name) => name.endsWith('.md'));
}

/** Narrow a list of corpus entries to the discoverable records. */
export function filterRecordFiles(entries: string[]): string[] {
  return entries.filter(
    (name) => !NON_RECORD_FILES.has(name) && RECORD_NAME.test(name),
  );
}

/**
 * Extract the YAML frontmatter block from a record's raw contents.
 *
 * Parsed with a real YAML parser rather than a line regex: `reviewBy` is a
 * top-level scalar, but the block also contains nested `affects`, `provenance`
 * and `review` mappings, and a naive per-line match would happily read an
 * indented key from one of those.
 */
export function parseFrontmatter(contents: string): RecordFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents);
  if (!match) return {};

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch {
    // A record whose frontmatter will not parse is adrkit lint's problem to
    // report, not this module's. Treat it as having no readable fields.
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};
  const data = parsed as Record<string, unknown>;

  return {
    id: asString(data.id),
    title: asString(data.title),
    status: asString(data.status),
    reviewBy: asString(data.reviewBy),
  };
}

/**
 * YAML resolves an unquoted `2027-08-09` to a Date and an unquoted `0001` to a
 * number, so every field is normalised back to the string form the records use.
 */
function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return undefined;
}

/** Read and parse every discoverable record in the corpus. */
export function readRecords(corpusDir: string): AdrRecord[] {
  const entries = listCorpusEntries(corpusDir);
  if (entries === null) return [];

  return filterRecordFiles(entries)
    .sort()
    .map((file) => ({
      file,
      ...parseFrontmatter(readFileSync(path.join(corpusDir, file), 'utf8')),
    }));
}
