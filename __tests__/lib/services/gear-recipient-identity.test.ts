import { describe, expect, it } from "vitest";
import {
  addressingFromDedupeKey,
  anonymousRecipientDigest,
  dedupeKeyContainsAddress,
  maskDedupeKeyForDisplay,
  recipientIdentitySegment,
} from "@/lib/services/gear-recipient-identity";

const EMAIL = "donor@example.com";
const USER_ID = "cuuuuuuuuuuuuuuuuuuuuuuuu";
const PREFIX = "gear.pledge.acknowledged:cppppppppppppppppppppppppp:v1";

describe("gear recipient identity", () => {
  describe("anonymousRecipientDigest", () => {
    it("produces an opaque value that reveals nothing about the address", () => {
      const digest = anonymousRecipientDigest(EMAIL);
      expect(digest).toMatch(/^[0-9a-f]{32}$/);
      expect(digest).not.toContain("@");
      expect(digest).not.toContain("donor");
      expect(digest).not.toContain("example");
    });

    it("is stable across calls so deduplication still works", () => {
      expect(anonymousRecipientDigest(EMAIL)).toBe(anonymousRecipientDigest(EMAIL));
    });

    it("normalizes case and surrounding whitespace before digesting", () => {
      expect(anonymousRecipientDigest("  DoNoR@Example.COM ")).toBe(anonymousRecipientDigest(EMAIL));
    });

    it("separates distinct addresses", () => {
      expect(anonymousRecipientDigest("a@example.com")).not.toBe(
        anonymousRecipientDigest("b@example.com"),
      );
    });

    it("is keyed, so it is not a bare hash of the address", async () => {
      const { createHash } = await import("node:crypto");
      const unkeyed = createHash("sha256").update(EMAIL).digest("hex").slice(0, 32);
      expect(anonymousRecipientDigest(EMAIL)).not.toBe(unkeyed);
    });
  });

  describe("recipientIdentitySegment", () => {
    it("names an account by id", () => {
      expect(recipientIdentitySegment({ userId: USER_ID, email: EMAIL })).toBe(`user:${USER_ID}`);
    });

    it("names an account-less recipient by digest, never by address", () => {
      const segment = recipientIdentitySegment({ userId: null, email: EMAIL });
      expect(segment).toBe(`anon:${anonymousRecipientDigest(EMAIL)}`);
      expect(segment).not.toContain("@");
    });
  });

  describe("addressingFromDedupeKey", () => {
    it("classifies a tagged account key as ACCOUNT", () => {
      expect(addressingFromDedupeKey(`${PREFIX}:user:${USER_ID}`, EMAIL)).toBe("ACCOUNT");
    });

    it("classifies a tagged anonymous key as EXTERNAL", () => {
      const key = `${PREFIX}:anon:${anonymousRecipientDigest(EMAIL)}`;
      expect(addressingFromDedupeKey(key, EMAIL)).toBe("EXTERNAL");
    });

    it("classifies a tagged account key without needing the captured address", () => {
      // The address is gone after redaction; the key still has to be readable.
      expect(addressingFromDedupeKey(`${PREFIX}:user:${USER_ID}`, null)).toBe("ACCOUNT");
      expect(addressingFromDedupeKey(`${PREFIX}:anon:${"a".repeat(32)}`, null)).toBe("EXTERNAL");
    });

    it("sees through replay suffixes", () => {
      const key = `${PREFIX}:anon:${anonymousRecipientDigest(EMAIL)}:replay:2`;
      expect(addressingFromDedupeKey(key, EMAIL)).toBe("EXTERNAL");
      expect(addressingFromDedupeKey(`${PREFIX}:user:${USER_ID}:replay:1:replay:2`, EMAIL)).toBe(
        "ACCOUNT",
      );
    });

    it("still classifies legacy keys that embedded the address", () => {
      expect(addressingFromDedupeKey(`${PREFIX}:${EMAIL}`, EMAIL)).toBe("EXTERNAL");
      expect(addressingFromDedupeKey(`${PREFIX}:${USER_ID}`, EMAIL)).toBe("ACCOUNT");
    });

    it("classifies a backfilled legacy anonymous key as EXTERNAL", () => {
      // The backfill replaces the address with an opaque token, not a digest,
      // so the anon matcher must not assume a digest shape.
      expect(addressingFromDedupeKey(`${PREFIX}:anon:legacy-cxxxxxxxxxxxxxxxxxxxxxxxx`, EMAIL)).toBe(
        "EXTERNAL",
      );
    });

    it("resolves an unrecognized key to ACCOUNT so it is suppressed, not sent", () => {
      expect(addressingFromDedupeKey("nonsense", EMAIL)).toBe("ACCOUNT");
      expect(addressingFromDedupeKey("", EMAIL)).toBe("ACCOUNT");
      expect(addressingFromDedupeKey(`${PREFIX}:${USER_ID}`, null)).toBe("ACCOUNT");
    });

    it("does not treat a legacy account key as external when a stale address matches loosely", () => {
      // `endsWith` must be anchored on a segment boundary, not a substring.
      expect(addressingFromDedupeKey(`${PREFIX}:not-${EMAIL}`, EMAIL)).toBe("ACCOUNT");
    });
  });

  describe("maskDedupeKeyForDisplay", () => {
    it("leaves a tagged key untouched", () => {
      const key = `${PREFIX}:anon:${anonymousRecipientDigest(EMAIL)}`;
      expect(maskDedupeKeyForDisplay(key)).toBe(key);
    });

    it("removes an address inherited from a legacy key", () => {
      const masked = maskDedupeKeyForDisplay(`${PREFIX}:${EMAIL}:replay:1`);
      expect(masked).not.toContain("@");
      expect(masked).not.toContain("donor");
      expect(masked).toBe(`${PREFIX}:anon:[redacted]:replay:1`);
    });

    it("reports whether a key still carries an address", () => {
      expect(dedupeKeyContainsAddress(`${PREFIX}:${EMAIL}`)).toBe(true);
      expect(dedupeKeyContainsAddress(`${PREFIX}:user:${USER_ID}`)).toBe(false);
    });
  });
});
