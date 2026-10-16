/**
 * Where saved files go inside a connector's folder (storage locations design,
 * decision 1): one subfolder per document kind, the same on every connector.
 * Files saved flat before this stay where they are; only new files use these.
 */
import { PLAN_FORMAT } from "@/lib/plan-document";
import { RANKINGS_FORMAT } from "@/lib/rankings-document";

export const KIND_FOLDERS: Readonly<Record<string, string>> = {
    [PLAN_FORMAT]: "Practices",
    [RANKINGS_FORMAT]: "Rankings",
};

/** The subfolder a kind's new files go in; undefined for a kind this build doesn't place. */
export const kindFolderOf = (kind: string): string | undefined => KIND_FOLDERS[kind];

/** The kind whose subfolder this is; undefined for any other folder name. */
export const kindOfFolder = (folder: string): string | undefined => Object.keys(KIND_FOLDERS).find((kind) => KIND_FOLDERS[kind] === folder);

const DOCUMENT_EXTENSION = /(\.(?:olplan|rankings))?\.(?:json|jsonc|yaml|yml|toml)$/i;

/** True for a name a document file can have (one of the formats the readers take). */
export const isDocumentFileName = (name: string): boolean => DOCUMENT_EXTENSION.test(name);

/** The nth candidate for a name already taken: "u12 (2).json", before the document extension. */
export function numberedName(name: string, n: number): string {
    if (n <= 1) return name;
    const match = DOCUMENT_EXTENSION.exec(name);
    const cut = match ? match.index : name.length;
    return `${name.slice(0, cut)} (${n})${name.slice(cut)}`;
}

/**
 * Where OneDrive's app folder is, as coaches find it: `Apps/<the Entra
 * registration's application name>/`, which a fork sets, so it is described
 * rather than spelled out. Here, not in onedrive.ts, so the entry chunk can
 * say it without loading OneDrive.
 */
export const ONEDRIVE_FOLDER_DESCRIPTION = "the planner's folder inside Apps";
