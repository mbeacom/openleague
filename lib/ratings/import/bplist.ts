/**
 * A minimal reader for Apple's binary property list format ("bplist00"): enough to take the
 * page out of a Safari web archive. Pure, and bounded for an untrusted file: every offset,
 * count and length is checked against the file before anything is read or allocated, a
 * reference outside the object table is refused, and a walk never visits an object twice,
 * so a cyclic or self-referencing plist ends the walk instead of looping.
 *
 * Objects are read one level at a time: a dict or array gives its children's references,
 * not their values, so only the objects a caller asks for are ever decoded.
 */

/** A dict: each key with its value's reference. */
export interface PlistDict {
    kind: "dict";
    entries: Map<string, number>;
}

/** An array: its items' references. */
export interface PlistArray {
    kind: "array";
    refs: number[];
}

export type PlistValue = null | boolean | number | string | Uint8Array | PlistDict | PlistArray;

export interface BinaryPlist {
    /** The top object's reference. */
    top: number;
    /** One object, or undefined when it is out of range, malformed or of an unsupported type. */
    read(ref: number): PlistValue | undefined;
}

const MAGIC = "bplist00";
const TRAILER_LENGTH = 32;
/** Far more than a web archive holds; a count beyond it is a damaged or hostile file. */
const MAX_OBJECTS = 1 << 20;
const CHUNK = 0x2000;

export function isBinaryPlist(bytes: Uint8Array): boolean {
    if (bytes.length < MAGIC.length) return false;
    for (let k = 0; k < MAGIC.length; k++) if (bytes[k] !== MAGIC.charCodeAt(k)) return false;
    return true;
}

/** A big-endian unsigned integer, or NaN when it runs past `limit` or isn't a safe integer. */
function readUInt(bytes: Uint8Array, at: number, size: number, limit = bytes.length): number {
    if (!Number.isSafeInteger(at) || at < 0 || at + size > limit) return NaN;
    let value = 0;
    for (let k = 0; k < size; k++) value = value * 256 + bytes[at + k];
    return Number.isSafeInteger(value) ? value : NaN;
}

function codeUnits(read: (k: number) => number, length: number): string {
    let text = "";
    for (let start = 0; start < length; start += CHUNK) {
        const units = new Array<number>(Math.min(CHUNK, length - start));
        for (let k = 0; k < units.length; k++) units[k] = read(start + k);
        text += String.fromCharCode(...units);
    }
    return text;
}

/** Opens a binary plist, or returns null when its header, trailer or object table is malformed. */
export function openBinaryPlist(bytes: Uint8Array): BinaryPlist | null {
    if (!isBinaryPlist(bytes) || bytes.length < MAGIC.length + 1 + TRAILER_LENGTH) return null;
    const trailer = bytes.length - TRAILER_LENGTH;
    const offsetSize = bytes[trailer + 6];
    const refSize = bytes[trailer + 7];
    const count = readUInt(bytes, trailer + 8, 8);
    const top = readUInt(bytes, trailer + 16, 8);
    const table = readUInt(bytes, trailer + 24, 8);
    if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) return null;
    if (!(count >= 1 && count <= MAX_OBJECTS && top < count)) return null;
    // Objects lie between the header and the offset table; the table ends at the trailer.
    if (!(table > MAGIC.length && table + count * offsetSize <= trailer)) return null;

    const offsetOf = (ref: number): number => {
        if (!Number.isInteger(ref) || ref < 0 || ref >= count) return NaN;
        const offset = readUInt(bytes, table + ref * offsetSize, offsetSize);
        return offset >= MAGIC.length && offset < table ? offset : NaN;
    };

    /** An object's length (from its marker, or from the integer after it) and where its body starts. */
    const sized = (at: number): { length: number; start: number } | null => {
        const low = bytes[at] & 0x0f;
        if (low !== 0x0f) return { length: low, start: at + 1 };
        const marker = bytes[at + 1];
        if (marker === undefined || marker >> 4 !== 0x1 || (marker & 0x0f) > 3) return null;
        const size = 1 << (marker & 0x0f);
        const length = readUInt(bytes, at + 2, size, table);
        return Number.isNaN(length) ? null : { length, start: at + 2 + size };
    };

    /** References `count` long from `start`, or null when they run into the offset table. */
    const refsAt = (start: number, n: number): number[] | null => {
        if (start + n * refSize > table) return null;
        const refs = new Array<number>(n);
        for (let k = 0; k < n; k++) refs[k] = readUInt(bytes, start + k * refSize, refSize);
        return refs;
    };

    // A dict's keys are often one shared string: decode each once. Only a string object is read
    // as a key, so a key can never lead back into a dict.
    const strings = new Map<number, string | undefined>();
    const keyAt = (ref: number): string | undefined => {
        if (!strings.has(ref)) {
            const at = offsetOf(ref);
            const high = Number.isNaN(at) ? -1 : bytes[at] >> 4;
            const value = high === 0x5 || high === 0x6 ? read(ref) : undefined;
            strings.set(ref, typeof value === "string" ? value : undefined);
        }
        return strings.get(ref);
    };

    function read(ref: number): PlistValue | undefined {
        const at = offsetOf(ref);
        if (Number.isNaN(at)) return undefined;
        const marker = bytes[at];
        const high = marker >> 4;
        if (high === 0x0) return marker === 0x00 ? null : marker === 0x08 ? false : marker === 0x09 ? true : undefined;
        if (high === 0x1) {
            const size = 1 << (marker & 0x0f);
            // Eight-byte integers are signed; a negative one (or a 16-byte one) is never needed here.
            const value = size <= 8 ? readUInt(bytes, at + 1, size, table) : NaN;
            return Number.isNaN(value) ? undefined : value;
        }
        const body = sized(at);
        if (!body) return undefined;
        const { length, start } = body;
        if (high === 0x4) return start + length <= table ? bytes.subarray(start, start + length) : undefined;
        if (high === 0x5) return start + length <= table ? codeUnits((k) => bytes[start + k], length) : undefined;
        if (high === 0x6) return start + length * 2 <= table ? codeUnits((k) => bytes[start + 2 * k] * 256 + bytes[start + 2 * k + 1], length) : undefined;
        if (high === 0xa) {
            const refs = refsAt(start, length);
            return refs && { kind: "array", refs };
        }
        if (high === 0xd) {
            const refs = refsAt(start, length * 2);
            if (!refs) return undefined;
            const entries = new Map<string, number>();
            for (let k = 0; k < length; k++) {
                const key = keyAt(refs[k]);
                if (key === undefined) return undefined;
                if (!entries.has(key)) entries.set(key, refs[length + k]);
            }
            return { kind: "dict", entries };
        }
        return undefined;
    }

    return { top, read };
}

/**
 * The main page of a Safari web archive: `WebMainResource.WebResourceData`, decoded in the
 * archive's `WebResourceTextEncodingName` (UTF-8 when it names none, or one this browser
 * can't decode). Null when the file isn't a readable web archive.
 */
export function webArchiveMainPage(bytes: Uint8Array): string | null {
    const plist = openBinaryPlist(bytes);
    if (!plist) return null;
    const visited = new Set<number>();
    const visit = (ref: number | undefined): PlistValue | undefined => {
        if (ref === undefined || visited.has(ref)) return undefined;
        visited.add(ref);
        return plist.read(ref);
    };
    const asDict = (value: PlistValue | undefined) => (value && typeof value === "object" && "kind" in value && value.kind === "dict" ? value.entries : null);

    const root = asDict(visit(plist.top));
    const main = asDict(visit(root?.get("WebMainResource")));
    const data = visit(main?.get("WebResourceData"));
    // Not `instanceof`: bytes from another realm (a test DOM, a frame) are still bytes.
    if (!ArrayBuffer.isView(data)) return null;
    const label = visit(main?.get("WebResourceTextEncodingName"));
    return decodeText(data, typeof label === "string" ? label : "utf-8");
}

function decodeText(data: Uint8Array, label: string): string {
    let decoder: TextDecoder;
    try {
        decoder = new TextDecoder(label);
    } catch {
        decoder = new TextDecoder("utf-8");
    }
    return decoder.decode(data);
}
