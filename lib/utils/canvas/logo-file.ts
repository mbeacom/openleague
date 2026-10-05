/**
 * The static planner's logo upload (practice logo spec R4): the browser half
 * of the rule lib/media/logo-image.ts applies on the server. The type comes
 * from the file's bytes, and the header's declared size must be within
 * LOGO_INPUT_PIXEL_LIMIT before anything decodes it; the image is decoded with createImageBitmap, drawn
 * within 512×512 and stored as PNG; over 200 KB it is drawn again within 256;
 * still over, it is refused.
 */
import {
    LOGO_IMAGE_FALLBACK_PX,
    LOGO_IMAGE_MAX_PX,
    LOGO_MAX_BYTES,
    MAX_LOGO_PNG_BYTES,
    fitWithin,
    sniffLogoType,
} from "@/lib/media/logo-rules";
import { IMAGE_HEADER_BYTES, exceedsPixelLimit, readImageDimensions } from "@/lib/utils/image-dimensions";
import { MAX_PNG_DATA_URI_LENGTH, isPngDataUri, pngDataUriByteLength } from "@/lib/utils/png-data-uri";
import type { LogoImage } from "@/types/practice-planner";

export const LOGO_TYPE_MESSAGE = "Use a PNG, JPEG or WebP image.";
export const LOGO_FILE_SIZE_MESSAGE = "Use an image of 2 MB or less.";
export const LOGO_UNREADABLE_MESSAGE = "This image couldn't be read. Try another file.";
export const LOGO_TOO_DETAILED_MESSAGE = "This logo is too detailed to store. Try a simpler image.";

export type LogoFileResult = { ok: true; logo: LogoImage } | { ok: false; error: string };

const refuse = (error: string): LogoFileResult => ({ ok: false, error });
/** A thrown value's name for the one log line (a DOMException isn't an Error everywhere); never its message. */
const errorName = (error: unknown) =>
    typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : "unknown error";

export async function normalizeLogoFile(file: Blob): Promise<LogoFileResult> {
    if (file.size > LOGO_MAX_BYTES) return refuse(LOGO_FILE_SIZE_MESSAGE);
    let head: Uint8Array;
    try {
        head = new Uint8Array(await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer());
    } catch (error) {
        console.warn("Logo upload: the file couldn't be read:", errorName(error));
        return refuse(LOGO_UNREADABLE_MESSAGE);
    }
    if (!sniffLogoType(head)) return refuse(LOGO_TYPE_MESSAGE);
    // The declared size, checked before decoding: a small file can declare an enormous image.
    const declared = readImageDimensions(head);
    if (!declared) return refuse(LOGO_UNREADABLE_MESSAGE);
    if (exceedsPixelLimit(declared)) return refuse(LOGO_TOO_DETAILED_MESSAGE);

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (error) {
        console.warn("Logo upload: the image couldn't be decoded:", errorName(error));
        return refuse(LOGO_UNREADABLE_MESSAGE);
    }
    try {
        if (!(bitmap.width > 0 && bitmap.height > 0)) return refuse(LOGO_UNREADABLE_MESSAGE);
        for (const side of [LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX]) {
            const size = fitWithin(bitmap.width, bitmap.height, side);
            const canvas = document.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return refuse(LOGO_UNREADABLE_MESSAGE);
            ctx.drawImage(bitmap, 0, 0, size.width, size.height);
            const dataUrl = canvas.toDataURL("image/png");
            if (!dataUrl.startsWith("data:image/png;base64,")) return refuse(LOGO_UNREADABLE_MESSAGE);
            const fits = dataUrl.length <= MAX_PNG_DATA_URI_LENGTH && isPngDataUri(dataUrl) && pngDataUriByteLength(dataUrl) <= MAX_LOGO_PNG_BYTES;
            if (fits) return { ok: true, logo: { dataUrl, width: size.width, height: size.height } };
        }
        return refuse(LOGO_TOO_DETAILED_MESSAGE);
    } finally {
        bitmap.close();
    }
}
