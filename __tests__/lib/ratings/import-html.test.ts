import { describe, expect, it } from "vitest";
import { htmlToText, savedPageText } from "@/lib/ratings/import/html";
import { dataObject, dictObject, offsetTableOf, plistFromObjects, stringObject, webArchive, writeBinaryPlist } from "./bplist-writer";

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

    const PAGE = '<!DOCTYPE html><html lang="en"><body><div>9/20</div><div>Rink A</div></body></html>';

    it("takes the main page out of a web archive, not a frame stored before it", () => {
        const archive = webArchive({ main: PAGE, subframes: ["<html><body>an embedded frame</body></html>"] });
        expect(savedPageText(archive, "Schedule.webarchive")).toBe(PAGE);
        expect(savedPageText(archive, "renamed.bin")).toBe(PAGE);
    });

    it("keeps the whole page when a script in it writes a closing html tag", () => {
        const page = "<html><body><script>document.write('<html></html>');</script><div>9/20</div><div>Rink B</div></body></html>";
        expect(savedPageText(webArchive({ main: page }), "Schedule.webarchive")).toBe(page);
    });

    it("decodes the page in the encoding the archive names", () => {
        // "Rink A – Café" in windows-1252: the dash is 0x96 and the é is 0xE9, neither valid UTF-8.
        const page = Uint8Array.from([...new TextEncoder().encode("<html><body>Rink A "), 0x96, 0x20, 0x43, 0x61, 0x66, 0xe9, ...new TextEncoder().encode("</body></html>")]);
        expect(savedPageText(webArchive({ main: page, encoding: "windows-1252" }), "Schedule.webarchive")).toBe("<html><body>Rink A – Café</body></html>");
        expect(savedPageText(webArchive({ main: PAGE, encoding: null }), "Schedule.webarchive")).toBe(PAGE);
        expect(savedPageText(webArchive({ main: PAGE, encoding: "x-no-such-encoding" }), "Schedule.webarchive")).toBe(PAGE);
    });

    it("reads keys and values stored as UTF-16 strings", () => {
        const archive = plistFromObjects([
            dictObject([1], [2]),
            stringObject("WebMainResource", true),
            dictObject([3, 5], [4, 6]),
            stringObject("WebResourceData", true),
            dataObject(new TextEncoder().encode(PAGE)),
            stringObject("WebResourceTextEncodingName"),
            stringObject("utf-8", true),
        ]);
        expect(savedPageText(archive, "Schedule.webarchive")).toBe(PAGE);
    });

    describe("a damaged or hostile web archive", () => {
        const valid = () => webArchive({ main: PAGE, subframes: ["<html><body>frame</body></html>"] });
        const withTrailer = (offset: number, value: number[]) => {
            const archive = valid();
            archive.set(value, archive.length - offset);
            return archive;
        };
        const cases: Array<[string, () => Uint8Array]> = [
            ["truncated", () => valid().slice(0, -10)],
            ["cut off mid-object", () => valid().slice(0, 200)],
            ["a top object out of range", () => withTrailer(16, [0, 0, 0, 0, 0, 0, 0xff, 0xff])],
            ["a huge object count", () => withTrailer(24, [0, 0, 0x10, 0, 0, 0, 0, 0])],
            ["an offset table past the end", () => withTrailer(8, [0, 0, 0, 0, 0x7f, 0xff, 0xff, 0xff])],
            [
                "an object offset past the end",
                () => {
                    const archive = valid();
                    archive.set([0xff, 0xff, 0xff, 0xff], offsetTableOf(archive));
                    return archive;
                },
            ],
            ["a dict that holds itself", () => plistFromObjects([[0xd1, 0x00, 0x01, 0x00, 0x00], [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebMainResource")]])],
            [
                "a main resource whose data is the archive itself",
                () =>
                    plistFromObjects([
                        [0xd1, 0x00, 0x01, 0x00, 0x02],
                        [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebMainResource")],
                        [0xd1, 0x00, 0x03, 0x00, 0x00],
                        [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebResourceData")],
                    ]),
            ],
            ["a dict claiming two billion entries", () => plistFromObjects([[0xdf, 0x12, 0x7f, 0xff, 0xff, 0xff, 0x00, 0x00]])],
            [
                "data claiming an enormous length",
                () =>
                    plistFromObjects([
                        [0xd1, 0x00, 0x01, 0x00, 0x02],
                        [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebMainResource")],
                        [0xd1, 0x00, 0x03, 0x00, 0x04],
                        [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebResourceData")],
                        [0x4f, 0x13, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
                    ]),
            ],
            ["a reference out of range", () => plistFromObjects([[0xd1, 0x00, 0x01, 0x7f, 0xff], [0x5f, 0x10, 0x0f, ...new TextEncoder().encode("WebMainResource")]])],
            ["no main resource", () => writeBinaryPlist({ WebSubresources: [] })],
            ["a top object that isn't a dict", () => writeBinaryPlist(["WebMainResource"])],
        ];
        it.each(cases)("returns null for %s, without throwing", (_name, make) => {
            const archive = make();
            expect(() => savedPageText(archive, "Schedule.webarchive")).not.toThrow();
            expect(savedPageText(archive, "Schedule.webarchive")).toBeNull();
        });
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
