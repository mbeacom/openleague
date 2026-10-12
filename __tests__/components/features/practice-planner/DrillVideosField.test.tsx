/** The drill editor's Videos field (practice video links spec R8, R10). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { DrillVideosField } from "@/components/features/practice-planner/DrillVideosField";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { VIDEO_GUIDANCE_TEXT, VIDEO_HTTPS_MESSAGE, drillVideoLimitMessage, notAVideoMessage, type VideoLink } from "@/lib/utils/video-links";
import type { SavedPlay } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

const YT = "Ab3dE5fG7hJ";
const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

function Harness({ initial = [], onChange }: { initial?: VideoLink[]; onChange?: (v: VideoLink[]) => void }) {
    const [videos, setVideos] = useState<VideoLink[]>(initial);
    return (
        <DrillVideosField
            videos={videos}
            onChange={(next) => {
                setVideos(next);
                onChange?.(next);
            }}
        />
    );
}

const urlInput = () => screen.getByRole("textbox", { name: "Video link" });
const titleInput = () => screen.getByRole("textbox", { name: "Title (optional)" });
const startInput = () => screen.getByRole("textbox", { name: "Start (m:ss, optional)" });
const addButton = () => screen.getByRole("button", { name: "Add video" });
const rows = () => within(screen.getByRole("list", { name: "Drill videos" })).getAllByRole("listitem");

function add(url: string, title = "", start = "") {
    fireEvent.change(urlInput(), { target: { value: url } });
    fireEvent.change(titleInput(), { target: { value: title } });
    fireEvent.change(startInput(), { target: { value: start } });
    fireEvent.click(addButton());
}

describe("DrillVideosField", () => {
    it("shows the sharing guidance", () => {
        themed(<Harness />);
        expect(screen.getByText(VIDEO_GUIDANCE_TEXT)).toBeInTheDocument();
    });

    it("parses on blur: a recognized link shows its provider and stored address in a polite region", () => {
        themed(<Harness />);
        fireEvent.change(urlInput(), { target: { value: `https://youtu.be/${YT}?si=abc` } });
        fireEvent.blur(urlInput());
        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-live", "polite");
        expect(status).toHaveTextContent("YouTube");
        expect(status).toHaveTextContent(`https://www.youtube.com/watch?v=${YT}`);
    });

    it("ties an error to the input and adds nothing", () => {
        const onChange = vi.fn();
        themed(<Harness onChange={onChange} />);
        fireEvent.change(urlInput(), { target: { value: "http://example.org/clip" } });
        fireEvent.blur(urlInput());
        expect(urlInput()).toHaveAttribute("aria-invalid", "true");
        expect(urlInput()).toHaveAccessibleDescription(VIDEO_HTTPS_MESSAGE);
        fireEvent.click(addButton());
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.change(urlInput(), { target: { value: "https://www.youtube.com/@fictional-coaching-channel" } });
        fireEvent.click(addButton());
        expect(urlInput()).toHaveAccessibleDescription(notAVideoMessage("youtube"));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("adds a link normalized, with its title and typed start, and clears the form", () => {
        const onChange = vi.fn();
        themed(<Harness onChange={onChange} />);
        add(`https://youtu.be/${YT}?t=10`, "Breakout demo", "1:30");
        expect(onChange).toHaveBeenLastCalledWith([{ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 90, title: "Breakout demo" }]);
        expect(urlInput()).toHaveValue("");
        expect(rows()).toHaveLength(1);
    });

    it("refuses a malformed start time", () => {
        const onChange = vi.fn();
        themed(<Harness onChange={onChange} />);
        add(`https://youtu.be/${YT}`, "", "soon");
        expect(startInput()).toHaveAttribute("aria-invalid", "true");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("disables Add at 5 with the limit message", () => {
        const five = [1, 2, 3, 4, 5].map((n): VideoLink => ({ url: `https://example.org/${n}`, provider: "link" }));
        themed(<Harness initial={five} />);
        expect(addButton()).toBeDisabled();
        expect(screen.getByText(drillVideoLimitMessage())).toBeInTheDocument();
        expect(drillVideoLimitMessage()).toBe("Up to 5 videos per drill");
    });

    it("moves, edits and removes with named buttons", () => {
        const onChange = vi.fn();
        const initial: VideoLink[] = [
            { url: "https://example.org/a", provider: "link", title: "First" },
            { url: "https://example.org/b", provider: "link", title: "Second" },
        ];
        themed(<Harness initial={initial} onChange={onChange} />);
        expect(screen.getByRole("button", { name: "Move First up" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Move First down" }));
        expect(onChange).toHaveBeenLastCalledWith([initial[1], initial[0]]);

        fireEvent.click(screen.getByRole("button", { name: "Edit Second" }));
        expect(urlInput()).toHaveValue("https://example.org/b");
        fireEvent.change(titleInput(), { target: { value: "Second, renamed" } });
        fireEvent.click(screen.getByRole("button", { name: "Save video" }));
        expect(onChange).toHaveBeenLastCalledWith([{ ...initial[1], title: "Second, renamed" }, initial[0]]);

        fireEvent.click(screen.getByRole("button", { name: "Remove First" }));
        expect(onChange).toHaveBeenLastCalledWith([{ ...initial[1], title: "Second, renamed" }]);
    });

    it("keeps saving to the link being edited after it is moved", () => {
        const onChange = vi.fn();
        const initial: VideoLink[] = [
            { url: "https://example.org/a", provider: "link", title: "First" },
            { url: "https://example.org/b", provider: "link", title: "Second" },
            { url: "https://example.org/c", provider: "link", title: "Third" },
        ];
        themed(<Harness initial={initial} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit First" }));
        fireEvent.click(screen.getByRole("button", { name: "Move First down" }));
        // Moving a neighbour across the edited link shifts it too.
        fireEvent.click(screen.getByRole("button", { name: "Move Third up" }));
        expect(onChange).toHaveBeenLastCalledWith([initial[1], initial[2], initial[0]]);
        fireEvent.change(titleInput(), { target: { value: "First, renamed" } });
        fireEvent.click(screen.getByRole("button", { name: "Save video" }));
        expect(onChange).toHaveBeenLastCalledWith([initial[1], initial[2], { ...initial[0], title: "First, renamed" }]);
    });

    it("renders no player or remote image in the editor", () => {
        const { container } = themed(<Harness initial={[{ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }]} />);
        expect(container.querySelectorAll("iframe, img, video")).toHaveLength(0);
    });
});

describe("PlayEditor saves video links inside playData", () => {
    it("keeps the drill's links and saves an added one", async () => {
        const onSave = vi.fn<(play: SavedPlay) => Promise<void>>().mockResolvedValue(undefined);
        const existing: VideoLink = { url: "https://example.org/old", provider: "link", title: "Old clip" };
        themed(
            <PlayEditor
                teamId="team-1"
                initialData={{ name: "Riverside Breakout", playData: { ...createEmptyPlayData(), videos: [existing] } }}
                onSave={onSave}
            />,
        );
        expect(rows()).toHaveLength(1);
        add(`https://vimeo.com/123456789#t=15s`);
        fireEvent.click(screen.getByRole("button", { name: /save play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].playData.videos).toEqual([existing, { url: "https://vimeo.com/123456789", provider: "vimeo", startSec: 15 }]);
    });

    it("omits the key when every link is removed", async () => {
        const onSave = vi.fn<(play: SavedPlay) => Promise<void>>().mockResolvedValue(undefined);
        themed(
            <PlayEditor
                teamId="team-1"
                initialData={{ name: "Riverside Breakout", playData: { ...createEmptyPlayData(), videos: [{ url: "https://example.org/old", provider: "link" }] } }}
                onSave={onSave}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Remove Video link" }));
        fireEvent.click(screen.getByRole("button", { name: /save play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect("videos" in onSave.mock.calls[0][0].playData).toBe(false);
    });
});
