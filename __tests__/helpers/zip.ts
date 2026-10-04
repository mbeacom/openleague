/** Test-only zip reader: one entry out of an archive (stored or deflated), via the central directory. */
import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

function centralDirectory(zip: Uint8Array): { view: DataView; count: number; offset: number } {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let eocd = zip.length - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== END_OF_CENTRAL_DIRECTORY) eocd--;
    if (eocd < 0) throw new Error("not a zip archive");
    return { view, count: view.getUint16(eocd + 10, true), offset: view.getUint32(eocd + 16, true) };
}

function* entries(zip: Uint8Array) {
    const { view, count, offset } = centralDirectory(zip);
    const decoder = new TextDecoder();
    let entry = offset;
    for (let i = 0; i < count; i++) {
        const nameLength = view.getUint16(entry + 28, true);
        yield {
            name: decoder.decode(zip.subarray(entry + 46, entry + 46 + nameLength)),
            method: view.getUint16(entry + 10, true),
            compressedSize: view.getUint32(entry + 20, true),
            localHeader: view.getUint32(entry + 42, true),
        };
        entry += 46 + nameLength + view.getUint16(entry + 30, true) + view.getUint16(entry + 32, true);
    }
}

export function zipEntryNames(zip: Uint8Array): string[] {
    return Array.from(entries(zip), (entry) => entry.name);
}

export function unzipEntry(zip: Uint8Array, name: string): Uint8Array | null {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (const entry of entries(zip)) {
        if (entry.name !== name) continue;
        const start = entry.localHeader + 30 + view.getUint16(entry.localHeader + 26, true) + view.getUint16(entry.localHeader + 28, true);
        const data = zip.subarray(start, start + entry.compressedSize);
        return entry.method === 0 ? data : new Uint8Array(inflateRawSync(data));
    }
    return null;
}
