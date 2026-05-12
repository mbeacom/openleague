import { describe, expect, it } from "vitest";

import { sanitizeForDatabase, sanitizeHtml } from "@/lib/utils/sanitization";

describe("sanitizeHtml", () => {
  it("escapes script and iframe markup instead of filtering with bypassable regexes", () => {
    const input = '<script>alert("xss")</script><iframe src="https://evil.test"></iframe>';

    expect(sanitizeHtml(input)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;&lt;iframe src&#x3D;&quot;https:&#x2F;&#x2F;evil.test&quot;&gt;&lt;&#x2F;iframe&gt;",
    );
  });

  it("neutralizes event-handler attributes by encoding the containing tag", () => {
    const input = "<img src=x onerror=alert(1)>";

    expect(sanitizeHtml(input)).toBe("&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;");
  });

  it("keeps dangerous URL schemes inert when they appear inside markup", () => {
    const input = '<a href="java\nscript:alert(1)">open</a>';

    expect(sanitizeHtml(input)).toBe(
      "&lt;a href&#x3D;&quot;java\nscript:alert(1)&quot;&gt;open&lt;&#x2F;a&gt;",
    );
  });

  it("removes unsafe control characters while preserving tabs and newlines", () => {
    expect(sanitizeHtml("hello\u0000\u0008world\nnext\tcell")).toBe("helloworld\nnext\tcell");
  });
});

describe("sanitizeForDatabase", () => {
  it("applies SQL-pattern cleanup before HTML escaping so entities stay intact", () => {
    expect(sanitizeForDatabase("<b>League</b>; DROP SELECT")).toBe(
      "&lt;b&gt;League&lt;&#x2F;b&gt;  ",
    );
  });
});
