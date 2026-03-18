/**
 * Unit tests for thumbnail generator utilities
 *
 * Tests pure functions that don't require canvas rendering:
 * - isValidPngBase64
 * - getBase64Size
 * - THUMBNAIL_DIMENSIONS constant
 */

import { describe, it, expect } from "vitest";
import {
  isValidPngBase64,
  getBase64Size,
  THUMBNAIL_DIMENSIONS,
} from "@/lib/utils/canvas/thumbnail-generator";

describe("THUMBNAIL_DIMENSIONS", () => {
  it("has expected thumbnail dimensions", () => {
    expect(THUMBNAIL_DIMENSIONS.width).toBe(300);
    expect(THUMBNAIL_DIMENSIONS.height).toBe(128);
  });
});

describe("isValidPngBase64", () => {
  it("validates a correct PNG base64 string", () => {
    const valid = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    expect(isValidPngBase64(valid)).toBe(true);
  });

  it("rejects non-PNG base64 strings", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(isValidPngBase64(jpeg)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPngBase64("")).toBe(false);
  });

  it("rejects non-base64 strings", () => {
    expect(isValidPngBase64("not-base64-data")).toBe(false);
  });

  it("rejects strings without data URI prefix", () => {
    expect(isValidPngBase64("iVBORw0KGgoAAAANSUhEUgAAAAE=")).toBe(false);
  });
});

describe("getBase64Size", () => {
  it("calculates size of a base64 string", () => {
    const small = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=";
    const size = getBase64Size(small);
    expect(size).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(getBase64Size("")).toBe(0);
  });

  it("larger data produces larger size", () => {
    const small = "data:image/png;base64,AAAA";
    const large = "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(getBase64Size(large)).toBeGreaterThan(getBase64Size(small));
  });
});
