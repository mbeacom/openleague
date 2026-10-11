/**
 * A stable envelope id for a record that has no UUID of its own (storage
 * connectors spec R1; ADR-0022). The hosted app keys sessions and rankings
 * records by cuid, so its exports derive the id from the record: every
 * download of one record carries the same id, and the static planner can tell
 * a re-download from a new document. Pure and portable (ADR-0020).
 */

/** SHA-256 of `${namespace}:${recordId}`, shaped as an RFC 9562 version 8 (custom) UUID. */
export async function derivedDocumentId(namespace: string, recordId: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${namespace}:${recordId}`)));
    const bytes = digest.slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The namespaces hosted records derive their ids under. */
export const HOSTED_SESSION_ID_NAMESPACE = "openleague-hosted:practice-session";
export const HOSTED_RANKINGS_ID_NAMESPACE = "openleague-hosted:rankings-record";
