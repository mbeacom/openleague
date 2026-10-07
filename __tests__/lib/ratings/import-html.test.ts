import { describe, expect, it } from "vitest";
import { htmlToText, savedPageText } from "@/lib/ratings/import/html";

const bytes = (...parts: Array<string | number[]>) => {
    const chunks = parts.map((part) => (typeof part === "string" ? new TextEncoder().encode(part) : Uint8Array.from(part)));
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
};

describe("savedPageText", () => {
    it("returns a saved HTML or text file as it is", () => {
        expect(savedPageText(bytes("<html><body>Rink A</body></html>"), "page.html")).toBe("<html><body>Rink A</body></html>");
        expect(savedPageText(bytes("9/20\n9:00am"), "page.txt")).toBe("9/20\n9:00am");
    });

    it("takes the page out of a web archive, ignoring the plist around it and the resources after it", () => {
        // A binary plist: magic, binary keys and lengths, the main resource's HTML bytes, then a subresource's.
        const archive = bytes(
            "bplist00",
            [0xd4, 0x01, 0x02, 0x03, 0x04, 0x00, 0x4f, 0x11, 0x01, 0x2c],
            "WebMainResource",
            [0x5f, 0x10, 0x0f],
            '<!DOCTYPE html><html lang="en"><body><div>9/20</div><div>Rink A</div></body></html>',
            [0x00, 0xff, 0x89, 0x50, 0x4e, 0x47],
            "<html><body>an embedded frame</body></html>",
        );
        expect(savedPageText(archive, "Schedule.webarchive")).toBe('<!DOCTYPE html><html lang="en"><body><div>9/20</div><div>Rink A</div></body></html>');
        expect(savedPageText(archive, "renamed.bin")).toContain("<div>Rink A</div>");
    });

    it("returns null for a web archive without a page", () => {
        expect(savedPageText(bytes("bplist00", [0x00, 0x01]), "empty.webarchive")).toBeNull();
    });
});

describe("htmlToText", () => {
    it("drops script and comment content, keeping visible text", () => {
        expect(htmlToText("<div>Rink A</div><script>alert(1)</script><!-- note --><p>Rink B</p>")).toBe("Rink A\nRink B");
    });

    it("removes blocks that a single pass would splice back together", () => {
        const text = htmlToText("<p>Rink A</p><scr<script>x</script>ipt>alert(1)</script><!<!-- a -->-- b -->");
        expect(text).not.toMatch(/<script|<!--/i);
        expect(text).not.toContain("alert(1)");
        expect(text.split("\n")[0]).toBe("Rink A");
    });
});
