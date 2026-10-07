/** Reading a chosen rankings file. Size first, then JSON, then parseRankings. Never throws. */
import { MAX_RANKINGS_FILE_BYTES, NOT_RANKINGS_MESSAGE, parseRankings, type ParseRankingsResult } from "./document";

export const RANKINGS_FILE_TOO_LARGE_MESSAGE = `This file is too large to be a rankings file (the limit is ${MAX_RANKINGS_FILE_BYTES / 1_000_000} MB).`;

export async function readRankingsFile(file: File): Promise<ParseRankingsResult> {
    if (file.size > MAX_RANKINGS_FILE_BYTES) return { ok: false, error: { code: "invalid", message: RANKINGS_FILE_TOO_LARGE_MESSAGE } };
    let raw: unknown;
    try {
        raw = JSON.parse(await file.text());
    } catch {
        return { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
    }
    return parseRankings(raw);
}
