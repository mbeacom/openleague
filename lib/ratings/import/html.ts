/** Minimal HTML → text for pasted or saved league pages (spec R2). Pure: no DOM. */

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
 * archive: a binary property list holding the page's HTML bytes verbatim, followed by its
 * images and scripts. Its page is the first `<html>…</html>` span (the main resource comes
 * first). Returns null for a web archive with no page in it.
 */
export function savedPageText(bytes: Uint8Array, fileName = ""): string | null {
    const text = new TextDecoder("utf-8").decode(bytes);
    const archive = /\.webarchive$/i.test(fileName) || text.startsWith("bplist");
    if (!archive) return text;
    const start = text.search(/<!doctype html|<html[\s>]/i);
    if (start === -1) return null;
    const close = /<\/html\s*>/i.exec(text.slice(start));
    return close ? text.slice(start, start + close.index + close[0].length) : text.slice(start);
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
