import { describe, expect, it } from "vitest";
import { readSse, type SseFrame } from "@/lib/ai/sse";
import { streamOf } from "./fixtures";

async function frames(chunks: Array<string | Uint8Array>): Promise<SseFrame[]> {
    const out: SseFrame[] = [];
    for await (const frame of readSse(streamOf(chunks))) out.push(frame);
    return out;
}

const TEXT = 'event: a\ndata: {"x":1}\n\n: a comment\ndata: line one\ndata: line two\n\nevent: b\ndata: é ✓\n\n';
const EXPECTED: SseFrame[] = [
    { event: "a", data: '{"x":1}' },
    { event: null, data: "line one\nline two" },
    { event: "b", data: "é ✓" },
];

describe("readSse", () => {
    it("reads named frames, comments and multi-line data", async () => {
        expect(await frames([TEXT])).toEqual(EXPECTED);
    });

    it("gives the same frames however the bytes are split, even inside a character", async () => {
        const bytes = new TextEncoder().encode(TEXT);
        for (let cut = 1; cut < bytes.length; cut++) {
            expect(await frames([bytes.slice(0, cut), bytes.slice(cut)])).toEqual(EXPECTED);
        }
        expect(await frames(Array.from(bytes, (byte) => new Uint8Array([byte])))).toEqual(EXPECTED);
    });

    it("accepts CRLF and CR line endings, split anywhere", async () => {
        const crlf = TEXT.replace(/\n/g, "\r\n");
        expect(await frames([crlf])).toEqual(EXPECTED);
        for (let cut = 1; cut < crlf.length; cut++) {
            expect(await frames([crlf.slice(0, cut), crlf.slice(cut)])).toEqual(EXPECTED);
        }
        expect(await frames([TEXT.replace(/\n/g, "\r")])).toEqual(EXPECTED);
    });

    it("reads a last frame that has no blank line after it", async () => {
        expect(await frames(["data: [DONE]"])).toEqual([{ event: null, data: "[DONE]" }]);
        expect(await frames(["data: one\n"])).toEqual([{ event: null, data: "one" }]);
    });

    it("keeps a value's own leading spaces after the first", async () => {
        expect(await frames(["data:  two spaces\n\ndata:none\n\n"])).toEqual([
            { event: null, data: " two spaces" },
            { event: null, data: "none" },
        ]);
    });
});
