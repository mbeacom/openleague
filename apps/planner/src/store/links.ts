/**
 * The local link table (storage connectors spec R3; ADR-0022): which remote
 * file each local document is saved to, and the revision this device last read
 * or wrote. Per-device sync state only, never written into a file, and never a
 * credential. At most one link per document in v1.
 */
import type { DocumentKind } from "@/lib/document-envelope";
import type { ConnectorId } from "../storage/connector";
import type { DocumentLink, PlannerRepo, RepoTx } from "./records";

export type { DocumentLink } from "./records";

const CONNECTOR_IDS: readonly ConnectorId[] = ["local-file", "google-drive", "onedrive"];

/** The link table's key for a local document: `${kind}:${localId}`. */
export function docKeyOf(kind: DocumentKind, localId: string): string {
    return `${kind}:${localId}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A stored link this build can use. Anything else reads as no link, so a damaged record never breaks a save. */
export function isDocumentLink(value: unknown): value is DocumentLink {
    if (!isRecord(value) || !isRecord(value.remote)) return false;
    const { remote } = value;
    return (
        typeof value.docKey === "string" &&
        typeof value.documentId === "string" &&
        CONNECTOR_IDS.includes(value.connector as ConnectorId) &&
        typeof remote.fileId === "string" &&
        typeof remote.name === "string" &&
        (remote.driveId === undefined || typeof remote.driveId === "string") &&
        (value.baseRevision === null || typeof value.baseRevision === "string") &&
        typeof value.baseHash === "string" &&
        typeof value.baseWrittenHere === "boolean" &&
        typeof value.dirty === "boolean" &&
        typeof value.lastSyncedAt === "string"
    );
}

export interface LinkStore {
    get: (docKey: string) => Promise<DocumentLink | null>;
    /** Replaces any link the document had: one remote per document. */
    put: (link: DocumentLink) => Promise<void>;
    /** "Unlink": the local link only; the remote file is left alone. */
    delete: (docKey: string) => Promise<void>;
    list: () => Promise<DocumentLink[]>;
}

export function createLinkStore(repo: PlannerRepo): LinkStore {
    return {
        get: async (docKey) => {
            const stored = await repo.read((tx) => tx.getLink(docKey));
            return isDocumentLink(stored) ? stored : null;
        },
        put: async (link) => {
            await repo.write((tx) => tx.putLink(link));
        },
        delete: async (docKey) => {
            await repo.write((tx) => tx.deleteLink(docKey));
        },
        list: async () => (await repo.read((tx) => tx.allLinks())).filter(isDocumentLink),
    };
}

/**
 * Inside a store write to a document: marks its link dirty (the engine's
 * noteLocalEdit, in the same transaction). No link, or a damaged one: nothing.
 */
export async function noteLocalEditInTx(tx: RepoTx, docKey: string): Promise<void> {
    const link = await tx.getLink(docKey);
    if (isDocumentLink(link) && !link.dirty) await tx.putLink({ ...link, dirty: true });
}
