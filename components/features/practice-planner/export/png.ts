/**
 * PNG data URIs: the only image source the document exports embed. Anything
 * else (an SVG, a URL, `data:,` from an over-large canvas, malformed base64)
 * is treated as "no diagram".
 */
const PNG_DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Longest URI treated as an image (characters). A diagram canvas encodes to a
 * few hundred KB at most; the cap keeps a pathological or hostile imported plan
 * from forcing a multi-megabyte regex scan, base64 decode and document embed.
 */
export const MAX_PNG_DATA_URI_LENGTH = 2_000_000;

export function isPngDataUri(value: string | null | undefined): value is string {
    if (!value || value.length > MAX_PNG_DATA_URI_LENGTH) return false;
    const match = PNG_DATA_URI.exec(value);
    return match !== null && match[1].length % 4 === 0;
}

/** The bytes of a URI that passed isPngDataUri. */
export function pngDataUriToBytes(value: string): Uint8Array {
    const binary = atob(value.slice(value.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
