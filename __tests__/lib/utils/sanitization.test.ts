import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  escapeHtmlAttribute,
  normalizeEmail,
  sanitizeForDatabase,
  sanitizeHtml,
  sanitizePhoneNumber,
  sanitizeRateLimitKey,
  sanitizeUrl,
} from "@/lib/utils/sanitization";

describe("escapeHtml", () => {
  it("escapes script and iframe markup instead of filtering with bypassable regexes", () => {
    const input = '<script>alert("xss")</script><iframe src="https://evil.test"></iframe>';

    expect(escapeHtml(input)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;&lt;iframe src&#x3D;&quot;https:&#x2F;&#x2F;evil.test&quot;&gt;&lt;&#x2F;iframe&gt;",
    );
  });

  it("neutralizes event-handler attributes by encoding the containing tag", () => {
    const input = "<img src=x onerror=alert(1)>";

    expect(escapeHtml(input)).toBe("&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;");
  });

  it("keeps dangerous URL schemes inert when they appear inside markup", () => {
    const input = '<a href="java\nscript:alert(1)">open</a>';

    expect(escapeHtml(input)).toBe(
      "&lt;a href&#x3D;&quot;java\nscript:alert(1)&quot;&gt;open&lt;&#x2F;a&gt;",
    );
  });

  it("removes unsafe C0 and C1 control characters while preserving tabs and newlines", () => {
    expect(escapeHtml("hello\u0000\u0008world\u0085\nnext\tcell")).toBe(
      "helloworld\nnext\tcell",
    );
  });
});

describe("sanitizeHtml", () => {
  it("keeps the legacy function name as an alias for HTML escaping", () => {
    expect(sanitizeHtml("<strong>OpenLeague</strong>")).toBe(
      escapeHtml("<strong>OpenLeague</strong>"),
    );
  });
});

describe("escapeHtmlAttribute", () => {
  it("escapes attribute-breaking characters and collapses whitespace", () => {
    expect(escapeHtmlAttribute('  row\nname" onclick="alert(1)  ')).toBe(
      "row name&quot; onclick&#x3D;&quot;alert(1)",
    );
  });
});

describe("sanitizeUrl", () => {
  it("allows safe absolute and relative URLs", () => {
    expect(sanitizeUrl("https://openleague.test/rinks?q=ice time")).toBe(
      "https://openleague.test/rinks?q=ice%20time",
    );
    expect(sanitizeUrl("/rinks/north-ice")).toBe("/rinks/north-ice");
  });

  it("blocks unsafe and whitespace-obfuscated schemes", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(sanitizeUrl("java\nscript:alert(1)")).toBeNull();
    expect(sanitizeUrl("java\tscript:alert(1)")).toBeNull();
    expect(sanitizeUrl(" java\rscript:alert(1) ")).toBeNull();
    expect(sanitizeUrl("data:text/html,<svg onload=alert(1)>")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeUrl("ftp://example.com/file.txt")).toBeNull();
  });

  it("blocks protocol-relative and malformed absolute URLs", () => {
    expect(sanitizeUrl("//evil.test/path")).toBeNull();
    expect(sanitizeUrl("https://")).toBeNull();
  });

  it("blocks browser-normalized backslash URL forms", () => {
    expect(sanitizeUrl("/\\evil.test/path")).toBeNull();
    expect(sanitizeUrl("/\\\\evil.test/path")).toBeNull();
    expect(sanitizeUrl("\\/evil.test/path")).toBeNull();
    expect(sanitizeUrl("\\\\evil.test/path")).toBeNull();
    expect(sanitizeUrl("http:\\evil.test/path")).toBeNull();
  });

  it("can require absolute URLs with custom protocol allowlists", () => {
    expect(sanitizeUrl("/relative", { allowRelative: false })).toBeNull();
    expect(sanitizeUrl("tel:+15551234567")).toBe("tel:+15551234567");
    expect(sanitizeUrl("mailto:coach@example.com", { allowedProtocols: ["mailto"] })).toBe(
      "mailto:coach@example.com",
    );
    expect(sanitizeUrl("https://openleague.test", { allowedProtocols: ["mailto"] })).toBeNull();
  });

  it("does not replace context-specific HTML attribute escaping", () => {
    const url = sanitizeUrl('/relative" onclick="alert(1)');

    expect(url).toBe('/relative" onclick="alert(1)');
    expect(escapeHtmlAttribute(url ?? "")).toBe(
      "&#x2F;relative&quot; onclick&#x3D;&quot;alert(1)",
    );
  });
});

describe("sanitizeForDatabase", () => {
  it("applies SQL-pattern cleanup before HTML escaping so entities stay intact", () => {
    expect(sanitizeForDatabase("<b>League</b>; DROP SELECT")).toBe(
      "&lt;b&gt;League&lt;&#x2F;b&gt;  ",
    );
  });
});

describe("small text sanitizers", () => {
  it("normalizes emails after removing unsafe control characters", () => {
    expect(normalizeEmail("  COACH\u0000@Example.COM  ")).toBe("coach@example.com");
  });

  it("keeps only common phone number characters", () => {
    expect(sanitizePhoneNumber("+1 (555) 123-4567 ext<script>")).toBe("+1 (555) 123-4567");
  });

  it("keeps rate limit keys bounded and token-safe", () => {
    expect(sanitizeRateLimitKey("user:abc/../../<script>".repeat(10))).toMatch(
      /^[a-zA-Z0-9_.-]{1,100}$/,
    );
  });
});
