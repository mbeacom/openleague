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

/** Every element boundary becomes a line break; blank lines dropped; each line trimmed. */
export function htmlToText(html: string): string {
    const withoutCode = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const text = decodeEntities(withoutCode.replace(/<[^>]*>/g, "\n"));
    return text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");
}
