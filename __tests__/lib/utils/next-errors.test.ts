import { describe, expect, it } from "vitest";
import { isNextRedirectError, rethrowIfNextRedirectError } from "@/lib/utils/next-errors";

describe("next error helpers", () => {
  it("detects Next redirect errors by digest", () => {
    const error = Object.assign(new Error("Redirecting"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });

    expect(isNextRedirectError(error)).toBe(true);
    expect(() => rethrowIfNextRedirectError(error)).toThrow(error);
  });

  it("keeps existing NEXT_REDIRECT message detection for mocked redirects", () => {
    const error = new Error("NEXT_REDIRECT:/login");

    expect(isNextRedirectError(error)).toBe(true);
    expect(() => rethrowIfNextRedirectError(error)).toThrow(error);
  });

  it("ignores non-redirect errors", () => {
    expect(isNextRedirectError(new Error("Nope"))).toBe(false);
    expect(isNextRedirectError(null)).toBe(false);
    expect(() => rethrowIfNextRedirectError(new Error("Nope"))).not.toThrow();
  });
});