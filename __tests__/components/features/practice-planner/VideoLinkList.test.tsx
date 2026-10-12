/** Drill video cards (practice video links spec R4, R10): links only, nothing loads from a provider. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { VideoLinkList } from "@/components/features/practice-planner/VideoLinkList";
import type { VideoLink } from "@/lib/utils/video-links";

const YT = "Ab3dE5fG7hJ";
const VIDEOS: VideoLink[] = [
    { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 90, title: "Breakout demo" },
    { url: "https://vimeo.com/123456789/a1b2c3d4e5", provider: "vimeo", startSec: 20 },
    { url: "https://drive.google.com/file/d/1FakeDriveFileId_abcdefghijk/view", provider: "drive" },
    { url: "https://example.org/drills/clip", provider: "link" },
];

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

/** Every element that would make the browser fetch something on render. */
function remoteLoads(container: HTMLElement) {
    return [...container.querySelectorAll("iframe, img, video, audio, source, embed, object, script, link")];
}

describe("VideoLinkList", () => {
    afterEach(() => vi.restoreAllMocks());

    it("renders a labelled list with one card per link and loads nothing", () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const { container } = themed(<VideoLinkList videos={VIDEOS} label="Videos for Riverside Breakout" />);
        const list = screen.getByRole("list", { name: "Videos for Riverside Breakout" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(4);
        expect(remoteLoads(container)).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("shows the title or a provider fallback, the host and the start time", () => {
        themed(<VideoLinkList videos={VIDEOS} label="Videos" />);
        const items = screen.getAllByRole("listitem").map((li) => li.textContent);
        expect(items[0]).toContain("Breakout demo");
        expect(items[0]).toContain("youtube.com · from 1:30");
        expect(items[1]).toContain("Vimeo video");
        expect(items[1]).toContain("vimeo.com · from 0:20");
        expect(items[2]).toContain("Google Drive video");
        expect(items[2]).toContain("drive.google.com");
        expect(items[3]).toContain("Video link");
        expect(items[3]).toContain("example.org");
    });

    it("opens each link in a new tab without opener or referrer, with the start applied", () => {
        themed(<VideoLinkList videos={VIDEOS} label="Videos" />);
        const open = screen.getByRole("link", { name: "Open Breakout demo (opens in a new tab)" });
        expect(open).toHaveAttribute("href", `https://www.youtube.com/watch?v=${YT}&t=90`);
        expect(open).toHaveAttribute("target", "_blank");
        expect(open).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByRole("link", { name: "Open Vimeo video (opens in a new tab)" })).toHaveAttribute(
            "href",
            "https://vimeo.com/123456789/a1b2c3d4e5#t=20s",
        );
        for (const link of screen.getAllByRole("link")) {
            expect(link).toHaveAttribute("rel", "noopener noreferrer");
            expect(link).toHaveAttribute("target", "_blank");
        }
    });

    it("still inserts no player or image after Open is activated", () => {
        const { container } = themed(<VideoLinkList videos={VIDEOS} label="Videos" />);
        const open = screen.getByRole("link", { name: "Open Breakout demo (opens in a new tab)" });
        // jsdom does not navigate; the point is that the page itself never embeds anything.
        open.addEventListener("click", (e) => e.preventDefault());
        fireEvent.click(open);
        expect(remoteLoads(container)).toEqual([]);
    });

    it("renders nothing for no videos", () => {
        const { container } = themed(<VideoLinkList videos={[]} label="Videos" />);
        expect(container.querySelector("ul")).toBeNull();
    });
});
