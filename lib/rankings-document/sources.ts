/**
 * The league pages a rankings document remembers (static rankings spec,
 * Updating results). Pure. Only addresses and read times are kept, never page
 * content, and nothing here makes a request (spec R2).
 */
import { sourceUrlProblem, type RankingsDocument, type RankingsSource, type RankingsSourceKind, type RankingsSources } from "./document";

/** The saved source of `kind`, if any. */
export function docSource(doc: Pick<RankingsDocument, "sources"> | null | undefined, kind: RankingsSourceKind): RankingsSource | null {
    return doc?.sources?.[kind] ?? null;
}

/** Why a typed page address can't be saved, or null. An empty field is fine: it means "no page". */
export function pageAddressProblem(text: string): string | null {
    const url = text.trim();
    return url ? sourceUrlProblem(url) : null;
}

/**
 * Sets or clears the source of `kind`. An empty address removes it. `readAt`
 * marks the page as read and saved at that moment; without it, an unchanged
 * address keeps its last read time and a new one has none yet.
 */
export function withSource(doc: RankingsDocument, kind: RankingsSourceKind, url: string | null, { readAt }: { readAt?: string } = {}): RankingsDocument {
    const address = url?.trim() ?? "";
    const previous = docSource(doc, kind);
    const sources: RankingsSources = { ...doc.sources };
    if (!address) delete sources[kind];
    else sources[kind] = { url: address, lastReadAt: readAt ?? (previous?.url === address ? previous.lastReadAt : null) };
    const next: RankingsDocument = { ...doc, sources };
    if (!sources.schedule && !sources.snakeChart) delete next.sources;
    return next;
}
