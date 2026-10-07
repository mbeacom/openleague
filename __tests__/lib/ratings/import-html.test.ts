import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/ratings/import/html";

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
