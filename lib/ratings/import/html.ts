/** Minimal HTML → text for pasted or saved league pages (spec R2). Pure: no DOM. */
import { isBinaryPlist, webArchiveMainPage } from "./bplist";

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };

export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return NAMED[body.toLowerCase()] ?? match;
    });
}

export function looksLikeHtml(input: string): boolean {
    return /<(html|body|div|table|tr|td|span|a|p)\b/i.test(input);
}

/** Repeats a removal until nothing changes, so a removal can't splice a new match together. */
function removeUntilStable(text: string, pattern: RegExp): string {
    let previous: string;
    do {
        previous = text;
        text = text.replace(pattern, "");
    } while (text !== previous);
    return text;
}

/**
 * A saved page's text from the file's bytes. Safari's default "Save As" format is a web
 * archive: a binary property list holding the main page's bytes (`WebMainResource`) beside
 * its frames, images and scripts, in any order. The page is read from that structure and
 * decoded in the encoding the archive names. Returns null for a web archive whose structure
 * can't be read or holds no main page: a real archive always parses, so a damaged one gets
 * the "save as HTML" advice rather than a guess at which bytes are the page.
 */
export function savedPageText(bytes: Uint8Array, fileName = ""): string | null {
    if (isBinaryPlist(bytes) || /\.webarchive$/i.test(fileName)) return webArchiveMainPage(bytes);
    return new TextDecoder("utf-8").decode(bytes);
}

/** Every element boundary becomes a line break; blank lines dropped; each line trimmed. */
export function htmlToText(html: string): string {
    const withoutCode = removeUntilStable(
        removeUntilStable(html, /<!--[\s\S]*?-->/g),
        /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    );
    const text = decodeEntities(withoutCode.replace(/<[^>]*>/g, "\n"));
    return text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");
}
