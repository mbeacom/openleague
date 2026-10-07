/**
 * Test support: writes Apple binary property lists ("bplist00") so web archive tests run on
 * real archive structure, not on a byte span that merely looks like one. Supports what a
 * Safari web archive holds: dicts, arrays, strings (ASCII and UTF-16BE), data, non-negative
 * integers, booleans and null. Objects are written in depth-first order, keys before values,
 * so a dict's first key's value comes first in the file.
 */
export type PlistInput = null | boolean | number | string | Uint8Array | PlistInput[] | { [key: string]: PlistInput };

const OFFSET_SIZE = 4;
const REF_SIZE = 2;

function uint(value: number, size: number): number[] {
    const out = new Array<number>(size).fill(0);
    let rest = value;
    for (let k = size - 1; k >= 0; k--) {
        out[k] = rest % 256;
        rest = Math.floor(rest / 256);
    }
    return out;
}

function intObject(value: number): number[] {
    const size = value < 0x100 ? 1 : value < 0x10000 ? 2 : value < 0x100000000 ? 4 : 8;
    return [0x10 | Math.log2(size), ...uint(value, size)];
}

/** A marker with a length: in its low nibble, or 0xF and then an integer object. */
const sized = (high: number, length: number) => (length < 15 ? [(high << 4) | length] : [(high << 4) | 0xf, ...intObject(length)]);

/** A string object, as ASCII or, when asked or needed, as UTF-16BE. */
export function stringObject(text: string, utf16 = !/^[\x00-\x7f]*$/.test(text)): number[] {
    if (!utf16) return [...sized(0x5, text.length), ...Array.from(text, (c) => c.charCodeAt(0))];
    return [...sized(0x6, text.length), ...Array.from({ length: text.length }, (_, k) => uint(text.charCodeAt(k), 2)).flat()];
}

export const dataObject = (data: Uint8Array) => [...sized(0x4, data.length), ...data];

/** A dict object from key and value refs. */
export const dictObject = (keys: number[], values: number[]) => [...sized(0xd, keys.length), ...[...keys, ...values].flatMap((ref) => uint(ref, REF_SIZE))];

/** Assembles already-encoded objects (object k is ref k) into a plist whose top object is `top`. */
export function plistFromObjects(objects: ArrayLike<number>[], top = 0, refSize = REF_SIZE): Uint8Array<ArrayBuffer> {
    const out: number[] = [...new TextEncoder().encode("bplist00")];
    const offsets: number[] = [];
    for (const object of objects) {
        offsets.push(out.length);
        out.push(...Array.from(object));
    }
    const table = out.length;
    for (const offset of offsets) out.push(...uint(offset, OFFSET_SIZE));
    out.push(0, 0, 0, 0, 0, 0, OFFSET_SIZE, refSize, ...uint(objects.length, 8), ...uint(top, 8), ...uint(table, 8));
    return Uint8Array.from(out);
}

export function writeBinaryPlist(value: PlistInput): Uint8Array<ArrayBuffer> {
    const objects: number[][] = [];
    const add = (input: PlistInput): number => {
        const index = objects.length;
        objects.push([]);
        let body: number[];
        if (input === null) body = [0x00];
        else if (typeof input === "boolean") body = [input ? 0x09 : 0x08];
        else if (typeof input === "number") body = intObject(input);
        else if (typeof input === "string") body = stringObject(input);
        else if (ArrayBuffer.isView(input)) body = dataObject(input);
        else if (Array.isArray(input)) {
            const refs = input.map(add);
            body = [...sized(0xa, refs.length), ...refs.flatMap((ref) => uint(ref, REF_SIZE))];
        } else {
            const entries = Object.entries(input);
            const keys = entries.map(([key]) => add(key));
            body = dictObject(keys, entries.map(([, v]) => add(v)));
        }
        objects[index] = body;
        return index;
    };
    add(value);
    return plistFromObjects(objects);
}

const resource = (url: string, data: Uint8Array, encoding?: string): PlistInput => ({
    WebResourceData: data,
    WebResourceMIMEType: "text/html",
    ...(encoding === undefined ? {} : { WebResourceTextEncodingName: encoding }),
    WebResourceURL: url,
});

/**
 * A Safari web archive. Its subframes and subresources are written before the main
 * resource, as a real archive may do, so the main page is not the first page in the file.
 */
export function webArchive({ main, encoding = "UTF-8", subframes = [] }: { main: string | Uint8Array; encoding?: string | null; subframes?: string[] }): Uint8Array<ArrayBuffer> {
    const bytes = typeof main === "string" ? new TextEncoder().encode(main) : main;
    return writeBinaryPlist({
        WebSubframeArchives: subframes.map((html, k) => ({ WebMainResource: resource(`https://example.test/frame${k}`, new TextEncoder().encode(html)) })),
        WebSubresources: [resource("https://example.test/logo.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))],
        WebMainResource: resource("https://example.test/schedule", bytes, encoding ?? undefined),
    });
}

/** The offset of a plist's offset table, from its trailer. */
export const offsetTableOf = (plist: Uint8Array) => new DataView(plist.buffer, plist.byteOffset + plist.length - 8, 8).getUint32(4);
