/** Export plan → bench sheet (HTML) and Word document (.docx), sub-project 4. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const CREST = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggh==";
const { mockDocx } = vi.hoisted(() => ({ mockDocx: vi.fn() }));
// These tests are about the Crest's font; the diagram font (spec §3) resolves at once here.
vi.mock("@/lib/utils/canvas/diagram-fonts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/diagram-fonts")>()),
    waitForDiagramFont: () => Promise.resolve(),
}));
vi.mock("@/components/features/practice-planner/export/export-images", () => ({
    canvasRenderers: { diagram: () => PNG, swatch: () => PNG, crest: () => CREST },
}));
vi.mock("@/components/features/practice-planner/export/bench-sheet-docx", () => ({ renderBenchSheetDocx: mockDocx }));

import {
    ExportPlanMenu,
    LINK_COPIED_NOTICE,
    PREPARING_DOCX_NOTICE,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { logoPng } from "@/__tests__/helpers/logo-png";

const SESSION: ExportableSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    teamName: "Hawks U12",
    plays: [
        { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Hard", play: { name: "Breakout", description: null, playData: createEmptyPlayData() } },
    ],
};

let downloads: Array<{ download: string; blob: Blob }>;

beforeEach(() => {
    downloads = [];
    const blobs: Blob[] = [];
    mockDocx.mockReset();
    mockDocx.mockResolvedValue(new Blob(["PK"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
        blobs.push(blob as Blob);
        return `blob:${blobs.length}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ download: this.download, blob: blobs[Number((this.getAttribute("href") ?? "").split(":")[1]) - 1] });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

function readText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function choose(name: string) {
    fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name }));
}

describe("ExportPlanMenu bench sheet exports", () => {
    it("offers both document exports", () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        expect(screen.getByRole("menuitem", { name: "Download bench sheet (HTML)" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).toBeInTheDocument();
    });

    it("downloads the bench sheet as <slug>.html, team included on hosted", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(downloads[0].download).toBe("tuesday-skills.html");
        expect(downloads[0].blob.type).toBe("text/html;charset=utf-8");
        const html = await readText(downloads[0].blob);
        expect(html).toContain("<h1>Tuesday Skills</h1>");
        expect(html).toContain('<p class="team">Hawks U12</p>');
        expect(html).toContain(`src="${PNG}"`);
        expect(mockDocx).not.toHaveBeenCalled();
    });

    it("prints no team for a static device without Your team", async () => {
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, teamName: "", teamMark: null }} />, { platform: createHashPlatform() });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        const html = await readText(downloads[0].blob);
        expect(html).not.toContain('class="team"');
        expect(html).not.toContain('class="mark"');
    });

    const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Hawks U12", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png", color: null };
    const HOSTED = { ...SESSION, id: "csessionxxxxxxxxxxxxxxxxx", teamMark: MARK };

    it("embeds the hosted team's logo, fetched through the store", async () => {
        const store = createMockPlannerStore();
        store.getPracticeLogoImage!.mockResolvedValue({ dataUrl: logoPng(512, 512), width: 512, height: 512 });
        renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(store.getPracticeLogoImage).toHaveBeenCalledWith("csessionxxxxxxxxxxxxxxxxx");
        expect(await readText(downloads[0].blob)).toContain(`<img class="mark" src="${logoPng(512, 512)}" width="48" height="48" alt="Hawks U12 logo">`);
    });

    it.each([
        ["returns no logo", (s: ReturnType<typeof createMockPlannerStore>) => s.getPracticeLogoImage!.mockResolvedValue(null)],
        ["fails", (s: ReturnType<typeof createMockPlannerStore>) => s.getPracticeLogoImage!.mockRejectedValue(new Error("offline"))],
    ])("still exports, with the Crest, when the logo read %s", async (_label, arrange) => {
        const store = createMockPlannerStore();
        arrange(store);
        renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(await readText(downloads[0].blob)).toContain(`<img class="mark" src="${CREST}"`);
    });

    it("logs a failed logo read by its error type only, never the URL or an id", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const store = createMockPlannerStore();
            store.getPracticeLogoImage!.mockRejectedValue(new TypeError(`fetch ${MARK.logoUrl} for ${HOSTED.id}`));
            renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
            choose("Download bench sheet (HTML)");
            await waitFor(() => expect(downloads).toHaveLength(1));
            expect(warn).toHaveBeenCalledWith("Bench sheet export: the team logo is unavailable:", "TypeError");
            const logged = JSON.stringify(warn.mock.calls);
            for (const secret of [MARK.logoUrl, HOSTED.id, MARK.id]) expect(logged).not.toContain(secret);
        } finally {
            warn.mockRestore();
        }
    });

    it("uses the static profile's stored logo without asking the store", async () => {
        const store = createMockPlannerStore();
        const logo = { dataUrl: logoPng(512, 256), width: 512, height: 256 };
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, teamName: "Ice Hawks", teamMark: { id: "local", name: "Ice Hawks", logoUrl: logo.dataUrl, color: null, logoImage: logo } }} />, { store, platform: createHashPlatform() });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(store.getPracticeLogoImage).not.toHaveBeenCalled();
        const html = await readText(downloads[0].blob);
        expect(html).toContain('<p class="team">Ice Hawks</p>');
        expect(html).toContain('width="96" height="48" alt="Ice Hawks logo"');
    });

    describe("the Crest's font", () => {
        const original = Object.getOwnPropertyDescriptor(document, "fonts");
        let release: () => void = () => {};
        const load = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));

        beforeEach(() => {
            load.mockClear();
            Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
        });

        afterEach(() => {
            if (original) Object.defineProperty(document, "fonts", original);
            else delete (document as { fonts?: unknown }).fonts;
        });

        it("loads before the Crest is drawn into the export", async () => {
            renderWithPlanner(<ExportPlanMenu session={HOSTED} />);
            choose("Download bench sheet (HTML)");
            await waitFor(() => expect(load).toHaveBeenCalledWith(expect.stringMatching(/^800 68px /)));
            expect(downloads).toHaveLength(0);
            await act(async () => release());
            await waitFor(() => expect(downloads).toHaveLength(1));
            expect(await readText(downloads[0].blob)).toContain(`<img class="mark" src="${CREST}"`);
        });

        it("isn't waited for when there is no team name to draw a mark for", async () => {
            renderWithPlanner(<ExportPlanMenu session={{ ...HOSTED, teamName: "  " }} />);
            choose("Download bench sheet (HTML)");
            await waitFor(() => expect(downloads).toHaveLength(1));
            expect(load).not.toHaveBeenCalled();
        });

        it("isn't waited for when the logo is embedded", async () => {
            const store = createMockPlannerStore();
            store.getPracticeLogoImage!.mockResolvedValue({ dataUrl: logoPng(512, 512), width: 512, height: 512 });
            renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
            choose("Download bench sheet (HTML)");
            await waitFor(() => expect(downloads).toHaveLength(1));
            expect(load).not.toHaveBeenCalled();
        });
    });

    it("loads the Word renderer only on click and downloads <slug>.docx", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        expect(mockDocx).not.toHaveBeenCalled();
        choose("Download Word document (.docx)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(downloads[0].download).toBe("tuesday-skills.docx");
        expect(mockDocx).toHaveBeenCalledTimes(1);
        expect(mockDocx.mock.calls[0][0]).toMatchObject({ title: "Tuesday Skills", teamName: "Hawks U12" });
    });

    it("disables both exports while one runs, so a second click can't start another", async () => {
        let finish!: (blob: Blob) => void;
        mockDocx.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download Word document (.docx)");
        expect(await screen.findByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
        await waitFor(() => expect(mockDocx).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        expect(screen.getByRole("menuitem", { name: "Download bench sheet (HTML)" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).toHaveAttribute("aria-disabled", "true");
        finish(new Blob(["PK"]));
        await waitFor(() => expect(downloads).toHaveLength(1));
        await waitFor(() =>
            expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).not.toHaveAttribute("aria-disabled"),
        );
    });

    it("keeps the preparing notice up past the usual 6 s and through a click away while the export runs", async () => {
        let finish!: (blob: Blob) => void;
        mockDocx.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
        vi.useFakeTimers();
        try {
            renderWithPlanner(<ExportPlanMenu session={SESSION} />);
            choose("Download Word document (.docx)");
            await act(() => vi.advanceTimersByTimeAsync(0));
            expect(mockDocx).toHaveBeenCalled();
            await act(() => vi.advanceTimersByTimeAsync(7000));
            expect(screen.getByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
            fireEvent.click(document.body);
            await act(() => vi.advanceTimersByTimeAsync(0));
            expect(screen.getByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
            finish(new Blob(["PK"]));
            await act(() => vi.advanceTimersByTimeAsync(0));
            expect(downloads).toHaveLength(1);
            expect(screen.queryByText(PREPARING_DOCX_NOTICE)).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("offers no way to dismiss the preparing notice while the export runs", async () => {
        let finish!: (blob: Blob) => void;
        mockDocx.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download Word document (.docx)");
        expect(await screen.findByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
        await waitFor(() => expect(mockDocx).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        expect(screen.getByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
        finish(new Blob(["PK"]));
        await waitFor(() => expect(downloads).toHaveLength(1));
    });

    it("leaves a notice that replaced the preparing one when the export succeeds", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
        let finish!: (blob: Blob) => void;
        mockDocx.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
        try {
            renderWithPlanner(<ExportPlanMenu session={SESSION} />);
            choose("Download Word document (.docx)");
            await waitFor(() => expect(mockDocx).toHaveBeenCalled());
            fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
            fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));
            expect(await screen.findByText(LINK_COPIED_NOTICE)).toBeInTheDocument();
            finish(new Blob(["PK"]));
            await waitFor(() => expect(downloads).toHaveLength(1));
            await act(async () => {});
            expect(screen.getByText(LINK_COPIED_NOTICE)).toBeInTheDocument();
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("explains a failed export", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mockDocx.mockRejectedValue(new Error("boom"));
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download Word document (.docx)");
        // The "Preparing…" notice is an alert too: wait for the error to replace it.
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't create the file. Try again, or use Print bench sheet."));
        expect(downloads).toHaveLength(0);
    });
});
