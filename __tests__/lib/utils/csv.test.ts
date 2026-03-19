import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsvRow, toCsvContent } from "@/lib/utils/csv";

describe("escapeCsvField", () => {
  it("returns plain string unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("wraps field in quotes when it contains a comma", () => {
    expect(escapeCsvField("Smith, John")).toBe('"Smith, John"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("wraps field in quotes when it contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps field in quotes when it contains a carriage return", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("converts numbers to string", () => {
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(0)).toBe("0");
  });

  it("handles zero without quoting", () => {
    expect(escapeCsvField(0)).toBe("0");
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("escapes fields that need quoting", () => {
    expect(toCsvRow(["Smith, John", "42", null])).toBe('"Smith, John",42,');
  });

  it("handles mixed types", () => {
    expect(toCsvRow(["Player", 7, null, "ABC123"])).toBe("Player,7,,ABC123");
  });
});

describe("toCsvContent", () => {
  const headers = ["Name", "Role", "Jersey #"];
  const rows = [
    ["Alice", "Player", 7],
    ["Bob, Jr.", "Admin", null],
  ];

  it("starts with UTF-8 BOM", () => {
    const result = toCsvContent(headers, rows);
    expect(result.charCodeAt(0)).toBe(0xfeff);
  });

  it("includes header row as first line", () => {
    const result = toCsvContent(headers, rows);
    const lines = result.slice(1).split("\r\n");
    expect(lines[0]).toBe("Name,Role,Jersey #");
  });

  it("includes data rows after header", () => {
    const result = toCsvContent(headers, rows);
    const lines = result.slice(1).split("\r\n");
    expect(lines[1]).toBe("Alice,Player,7");
    expect(lines[2]).toBe('"Bob, Jr.",Admin,');
  });

  it("uses CRLF line endings", () => {
    const result = toCsvContent(headers, rows);
    expect(result.slice(1)).toContain("\r\n");
  });

  it("handles empty rows array", () => {
    const result = toCsvContent(headers, []);
    const lines = result.slice(1).split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Name,Role,Jersey #");
  });
});
