/**
 * PNG data URIs: the only image source the document exports embed. Anything
 * else (an SVG, a URL, `data:,` from an over-large canvas, malformed base64)
 * is treated as "no diagram".
 */
const PNG_DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export function isPngDataUri(value: string | null | undefined): value is string {
    if (!value) return false;
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
