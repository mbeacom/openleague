/**
 * Name redaction before a request (ADR-0023, spec R9): the names the coach
 * lists are replaced with "Coach 1", "Player 1", … and restored in the draft.
 * Deterministic and reversible. Matching ignores case and respects word
 * boundaries; a longer name wins over a name it contains. Only listed names
 * are replaced: nothing is detected automatically.
 */

export interface RedactionGroup {
    /** The placeholder's word: "Coach" gives "Coach 1", "Coach 2", … */
    label: string;
    names: readonly string[];
}

export interface Replacement {
    placeholder: string;
    /** The spelling first seen in the text: what restore writes back. */
    original: string;
    count: number;
}

/** The redacted text in pieces, so a preview can highlight each replacement. */
export type RedactionSegment = { text: string; placeholder?: undefined } | { text: string; placeholder: string; original: string };

export interface Redaction {
    text: string;
    segments: RedactionSegment[];
    replacements: Replacement[];
    /** Puts the names back in a model's reply. */
    restore: (text: string) => string;
}

const WORD = "[\\p{L}\\p{N}_]";

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, case-insensitive pattern for any of the terms, longest first. */
function wordPattern(terms: readonly string[]): RegExp | null {
    if (terms.length === 0) return null;
    const alternatives = [...terms].sort((a, b) => b.length - a.length).map(escapeRegExp);
    return new RegExp(`(?<!${WORD})(?:${alternatives.join("|")})(?!${WORD})`, "giu");
}

function cleanNames(names: readonly string[]): string[] {
    return names.map((name) => name.replace(/\s+/g, " ").trim()).filter((name) => name.length > 0);
}

export function redact(text: string, groups: readonly RedactionGroup[]): Redaction {
    // Each name, once, with its group. A name listed in two groups keeps the first.
    const owner = new Map<string, RedactionGroup>();
    for (const group of groups) {
        for (const name of cleanNames(group.names)) {
            const key = name.toLocaleLowerCase();
            if (!owner.has(key)) owner.set(key, group);
        }
    }
    const pattern = wordPattern(Array.from(owner.keys()));
    const assigned = new Map<string, Replacement>();
    const next = new Map<string, number>();
    const taken = (placeholder: string) => wordPattern([placeholder])!.test(text);
    const placeholderFor = (match: string): Replacement => {
        const key = match.toLocaleLowerCase();
        const existing = assigned.get(key);
        if (existing) return existing;
        const label = owner.get(key)!.label;
        let n = next.get(label) ?? 1;
        // A placeholder the coach's own text already uses is skipped, so restoring can't rewrite their words.
        while (taken(`${label} ${n}`)) n++;
        next.set(label, n + 1);
        const replacement: Replacement = { placeholder: `${label} ${n}`, original: match, count: 0 };
        assigned.set(key, replacement);
        return replacement;
    };

    const segments: RedactionSegment[] = [];
    let last = 0;
    if (pattern) {
        for (const match of text.matchAll(pattern)) {
            const index = match.index ?? 0;
            if (index > last) segments.push({ text: text.slice(last, index) });
            const replacement = placeholderFor(match[0]);
            replacement.count++;
            segments.push({ text: replacement.placeholder, placeholder: replacement.placeholder, original: match[0] });
            last = index + match[0].length;
        }
    }
    if (last < text.length) segments.push({ text: text.slice(last) });
    const replacements = Array.from(assigned.values());

    const back = new Map(replacements.map((r) => [r.placeholder.toLocaleLowerCase(), r.original]));
    const restorePattern = wordPattern(replacements.map((r) => r.placeholder));
    const restore = (reply: string) => (restorePattern ? reply.replace(restorePattern, (found) => back.get(found.toLocaleLowerCase()) ?? found) : reply);

    return { text: segments.map((segment) => segment.text).join(""), segments, replacements, restore };
}

/** Names typed one per line or separated by commas. */
export function parseNameList(raw: string): string[] {
    return Array.from(new Set(cleanNames(raw.split(/[\n,;]/))));
}
