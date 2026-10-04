/** The bench-sheet route (3b): the detail page's gate, no dashboard chrome, light scheme. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";

const { mockGetDetail, mockNotFound, mockRequireAuth } = vi.hoisted(() => ({
    mockGetDetail: vi.fn(),
    mockNotFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
    mockRequireAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    notFound: () => mockNotFound(),
    redirect: vi.fn(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/practice-session-queries", () => ({
    getPracticeSessionDetail: (...args: unknown[]) => mockGetDetail(...args),
}));
vi.mock("@/lib/auth/session", () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }));
vi.mock("@/components/features/practice-planner/print/BenchSheet", () => ({
    BenchSheet: ({ session }: { session: { title: string } }) => <div data-testid="bench-sheet">{session.title}</div>,
}));

import BenchSheetPage from "@/app/(print)/practice-planner/[sessionId]/print/page";
import PrintLayout from "@/app/(print)/layout";

const SESSION_ID = "csessionxxxxxxxxxxxxxxxxx";
const params = () => Promise.resolve({ sessionId: SESSION_ID });

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: "cuserxxxxxxxxxxxxxxxxxxxx" } });
});

describe("bench sheet page", () => {
    it("404s when the detail query rejects the viewer or finds nothing", async () => {
        mockGetDetail.mockResolvedValue(null);
        await expect(BenchSheetPage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mockGetDetail).toHaveBeenCalledWith(SESSION_ID);
    });

    it("renders the bench sheet for a session the viewer can see", async () => {
        mockGetDetail.mockResolvedValue({ session: { title: "Tuesday Skills" }, isAdmin: false });
        render(await BenchSheetPage({ params: params() }));
        expect(screen.getByTestId("bench-sheet")).toHaveTextContent("Tuesday Skills");
        expect(mockNotFound).not.toHaveBeenCalled();
    });
});

describe("print layout", () => {
    it("requires sign-in before rendering anything", async () => {
        mockRequireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
        await expect(PrintLayout({ children: <p>sheet</p> })).rejects.toThrow("NEXT_REDIRECT:/login");
    });

    it("pins its children to the light scheme", async () => {
        render(await PrintLayout({ children: <p>sheet</p> }));
        expect(screen.getByText("sheet").closest("[data-mui-color-scheme='light']")).not.toBeNull();
        expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    });
});

describe("print scoping", () => {
    it("marks the layout's main so print.css can target it without a bare main selector", async () => {
        render(await PrintLayout({ children: <p>sheet</p> }));
        expect(screen.getByText("sheet").closest("main")).toHaveClass("bench-print-root");
    });

    it("keeps every print.css rule scoped to the bench sheet", () => {
        const css = readFileSync(join(process.cwd(), "app/(print)/print.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(css).toMatch(/@page bench\s*\{/);
        expect(css).not.toMatch(/@page\s*\{/);
        expect(css).toMatch(/\.bench-sheet\s*\{\s*page:\s*bench;/);
        expect(css).toMatch(/html:has\(\.bench-sheet\)/);
        expect(css).not.toMatch(/(^|[\s,{}])main\s*\{/);
        expect(css).not.toMatch(/(^|[\s,{}])(html|body)\s*[,{]/);
    });

    it("never splits a rotation grid, and keeps a station block's row with its grid", () => {
        const css = readFileSync(join(process.cwd(), "app/(print)/print.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(css).toMatch(/\.bench-rotation\s*\{[^}]*break-inside:\s*avoid;/);
        expect(css).toMatch(/\.bench-keep-with-grid\s*\{[^}]*break-after:\s*avoid;/);
    });
});
