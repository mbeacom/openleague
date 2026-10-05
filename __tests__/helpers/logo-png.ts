/** A stub PNG data URL whose IHDR declares width × height: the header and length isLogoImage checks, not a decodable image. */
export function logoPng(width: number, height: number): string {
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const bytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(width), ...u32(height), 8, 6, 0, 0, 0,
        ...new Array(40).fill(0),
    ]);
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}
