/**
 * A server-sent-events reader for provider streams (spec R2): bytes in, one
 * frame per blank-line-terminated event out. Handles CRLF or LF, multi-line
 * data, comments, and frames or characters split across network chunks.
 */

export interface SseFrame {
    /** The `event:` name, or null when the frame has none. */
    event: string | null;
    /** The `data:` lines joined with "\n". */
    data: string;
}

function parseFrame(lines: string[]): SseFrame | null {
    let event: string | null = null;
    const data: string[] = [];
    for (const line of lines) {
        if (line === "" || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
    }
    return data.length === 0 && event === null ? null : { event, data: data.join("\n") };
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lines: string[] = [];
    const take = function* (final: boolean): Generator<SseFrame> {
        // A trailing CR may be the first half of a CR LF split across chunks: hold it back.
        let text = buffer;
        let held = "";
        if (!final && text.endsWith("\r")) {
            held = "\r";
            text = text.slice(0, -1);
        }
        // Split on CR LF, LF or CR; keep the last partial line unless the stream ended.
        const parts = text.split(/\r\n|\n|\r/);
        buffer = (final ? "" : (parts.pop() ?? "")) + held;
        for (const line of parts) {
            if (line === "") {
                const frame = parseFrame(lines);
                lines = [];
                if (frame) yield frame;
            } else {
                lines.push(line);
            }
        }
        if (final) {
            const frame = parseFrame(lines);
            lines = [];
            if (frame) yield frame;
        }
    };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            yield* take(false);
        }
        buffer += decoder.decode();
        yield* take(true);
    } finally {
        reader.releaseLock();
    }
}
