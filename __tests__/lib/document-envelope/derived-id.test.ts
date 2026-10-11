import { describe, expect, it } from "vitest";
import { HOSTED_RANKINGS_ID_NAMESPACE, HOSTED_SESSION_ID_NAMESPACE, derivedDocumentId, isEnvelopeId } from "@/lib/document-envelope";

describe("derivedDocumentId", () => {
    it("is a valid envelope id, the same for the same record, and different per record and namespace", async () => {
        const a = await derivedDocumentId(HOSTED_SESSION_ID_NAMESPACE, "csession0000000000000000a");
        expect(isEnvelopeId(a)).toBe(true);
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(await derivedDocumentId(HOSTED_SESSION_ID_NAMESPACE, "csession0000000000000000a")).toBe(a);
        expect(await derivedDocumentId(HOSTED_SESSION_ID_NAMESPACE, "csession0000000000000000b")).not.toBe(a);
        expect(await derivedDocumentId(HOSTED_RANKINGS_ID_NAMESPACE, "csession0000000000000000a")).not.toBe(a);
    });

    it("tells envelope ids from other ids", () => {
        expect(isEnvelopeId("0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11")).toBe(true);
        expect(isEnvelopeId("id-1")).toBe(false);
        expect(isEnvelopeId(null)).toBe(false);
    });
});
