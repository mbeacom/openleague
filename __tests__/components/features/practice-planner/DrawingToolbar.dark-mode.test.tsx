/**
 * Regression cover for the "washed out" drawing toolbar in dark mode.
 *
 * Under cssVariables, `theme.palette.*` read in JS always holds the LIGHT
 * literal, so a container painted with `theme.palette.background.paper` stayed
 * #FFFFFF in the dark scheme while the tool icons switched to white. The fix
 * is to style through palette tokens, which emit `var(--mui-palette-…)` and
 * resolve per scheme. jsdom keeps those var() references in computed style, so
 * the assertions check for the token rather than a resolved color.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "@/lib/theme";
import { DrawingToolbar, type DrawingToolbarProps } from "@/components/features/practice-planner/DrawingToolbar";

const props = (overrides?: Partial<DrawingToolbarProps>): DrawingToolbarProps => ({
    selectedTool: "stroke",
    selectedColor: "#212121",
    onToolChange: vi.fn(),
    onColorChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClear: vi.fn(),
    canUndo: true,
    canRedo: false,
    playerRole: "X",
    onPlayerRoleChange: vi.fn(),
    strokeOptions: { action: "skate", path: "straight", end: "arrow" },
    onStrokeOptionsChange: vi.fn(),
    equipmentKind: "cone",
    onEquipmentKindChange: vi.fn(),
    ...overrides,
});

const renderDark = (overrides?: Partial<DrawingToolbarProps>) =>
    render(
        <ThemeProvider theme={theme} defaultMode="dark">
            <DrawingToolbar {...props(overrides)} />
        </ThemeProvider>
    );

const LIGHT_LITERALS = ["#fff", "#ffffff", "rgb(255, 255, 255)", "white", "#000", "rgb(0, 0, 0)"];

describe("DrawingToolbar in the dark color scheme", () => {
    afterEach(() => document.documentElement.removeAttribute("data-mui-color-scheme"));

    it("runs under the dark scheme", () => {
        renderDark();
        expect(document.documentElement.getAttribute("data-mui-color-scheme")).toBe("dark");
    });

    it("paints the toolbar with the background.paper token, not the light literal", () => {
        renderDark();
        const toolbar = screen.getByRole("group", { name: "drawing tools" }).parentElement as HTMLElement;
        const bg = getComputedStyle(toolbar).backgroundColor;
        expect(bg).toContain("--mui-palette-background-paper");
        expect(LIGHT_LITERALS).not.toContain(bg.toLowerCase());
    });

    it("styles the selected tool through theme tokens", () => {
        renderDark();
        const selected = screen.getByLabelText("movement tool");
        expect(selected).toHaveAttribute("aria-pressed", "true");
        const style = getComputedStyle(selected);
        // Primary fill + contrast text, so the active tool stands out from its
        // unselected neighbours in both schemes (not MUI's faint 8%/16% tint).
        expect(style.color.toLowerCase()).toContain("--mui-palette-primary-contrasttext");
        expect(style.backgroundColor).toContain("--mui-palette-primary-main");
        expect(LIGHT_LITERALS).not.toContain(style.color.toLowerCase());

        const unselected = getComputedStyle(screen.getByLabelText("select tool"));
        expect(unselected.color).toContain("--mui-palette-action-active");
    });

    it("fills the selected stroke option with primary.main and its contrast text", () => {
        renderDark();
        const group = screen.getByRole("group", { name: "stroke action" });
        const selected = group.querySelector('button[aria-pressed="true"]') as HTMLElement;
        const style = getComputedStyle(selected);
        expect(style.backgroundColor).toContain("--mui-palette-primary-main");
        expect(style.color.toLowerCase()).toContain("--mui-palette-primary-contrasttext");
        const unselected = group.querySelector('button[aria-pressed="false"]') as HTMLElement;
        expect(getComputedStyle(unselected).backgroundColor).not.toContain("--mui-palette-primary-main");
    });
});
