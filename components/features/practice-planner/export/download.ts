/** Saving a generated file (plan, bench sheet, Word document) from the browser. */

/** Safari and Firefox can cut a download short if its object URL is revoked at once. */
export const REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
