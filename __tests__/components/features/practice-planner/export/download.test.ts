import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVOKE_DELAY_MS, downloadBlob } from "@/components/features/practice-planner/export/download";

let clicks: Array<{ download: string; href: string }>;

beforeEach(() => {
    clicks = [];
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ download: this.download, href: this.getAttribute("href") ?? "" });
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("downloadBlob", () => {
    it("clicks a temporary download link, then removes it", () => {
        const blob = new Blob(["x"], { type: "text/html" });
        downloadBlob(blob, "tuesday.html");
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(clicks).toEqual([{ download: "tuesday.html", href: "blob:file" }]);
        expect(document.querySelector("a[download]")).toBeNull();
    });

    it("revokes the URL only after the delay", () => {
        downloadBlob(new Blob(["x"]), "a.docx");
        vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file");
    });
});
