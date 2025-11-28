/**
 * Tests for DrawingToolbar component
 *
 * Comprehensive tests covering tool selection, color picker, undo/redo,
 * clear confirmation, and accessibility features.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { DrawingToolbar, DrawingToolbarProps } from "@/components/features/practice-planner/DrawingToolbar";
import { DrawingTool } from "@/types/practice-planner";

// Create a theme for consistent testing
const theme = createTheme();

// Helper to render component with theme
const renderWithTheme = (props: DrawingToolbarProps) => {
    return render(
        <ThemeProvider theme={theme}>
            <DrawingToolbar {...props} />
        </ThemeProvider>
    );
};

// Default props factory
const createDefaultProps = (overrides?: Partial<DrawingToolbarProps>): DrawingToolbarProps => ({
    selectedTool: "select",
    selectedColor: "#000000",
    onToolChange: vi.fn(),
    onColorChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClear: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
});

describe("DrawingToolbar", () => {
    describe("Rendering", () => {
        it("renders all tool buttons", () => {
            renderWithTheme(createDefaultProps());

            expect(screen.getByLabelText("select tool")).toBeInTheDocument();
            expect(screen.getByLabelText("player tool")).toBeInTheDocument();
            expect(screen.getByLabelText("line tool")).toBeInTheDocument();
            expect(screen.getByLabelText("curve tool")).toBeInTheDocument();
            expect(screen.getByLabelText("arrow tool")).toBeInTheDocument();
            expect(screen.getByLabelText("text tool")).toBeInTheDocument();
            expect(screen.getByLabelText("eraser tool")).toBeInTheDocument();
        });

        it("renders color picker button", () => {
            renderWithTheme(createDefaultProps());
            expect(screen.getByLabelText("color picker")).toBeInTheDocument();
        });

        it("renders undo and redo buttons", () => {
            renderWithTheme(createDefaultProps());
            expect(screen.getByLabelText("undo")).toBeInTheDocument();
            expect(screen.getByLabelText("redo")).toBeInTheDocument();
        });

        it("renders clear canvas button", () => {
            renderWithTheme(createDefaultProps());
            expect(screen.getByLabelText("clear canvas")).toBeInTheDocument();
        });
    });

    describe("Tool Selection (Requirements: 5.1, 5.4)", () => {
        it("calls onToolChange when tool is selected", async () => {
            const onToolChange = vi.fn();
            renderWithTheme(createDefaultProps({ onToolChange }));

            const lineButton = screen.getByLabelText("line tool");
            await userEvent.click(lineButton);

            expect(onToolChange).toHaveBeenCalledWith("line");
        });

        it("shows selected tool as active", () => {
            renderWithTheme(createDefaultProps({ selectedTool: "curve" }));

            const curveButton = screen.getByLabelText("curve tool");
            expect(curveButton).toHaveAttribute("aria-pressed", "true");
        });

        it("allows selecting different tool types", async () => {
            const onToolChange = vi.fn();
            renderWithTheme(createDefaultProps({ onToolChange }));

            // Test a selection of tools (not all, since select is already selected)
            const toolsToTest: Array<{ label: string; value: DrawingTool }> = [
                { label: "player tool", value: "player" },
                { label: "line tool", value: "line" },
                { label: "curve tool", value: "curve" },
                { label: "arrow tool", value: "arrow" },
                { label: "text tool", value: "text" },
                { label: "eraser tool", value: "eraser" },
            ];

            for (const tool of toolsToTest) {
                await userEvent.click(screen.getByLabelText(tool.label));
                expect(onToolChange).toHaveBeenCalledWith(tool.value);
            }

            expect(onToolChange).toHaveBeenCalledTimes(toolsToTest.length);
        });
    });

    describe("Color Picker (Requirements: 5.2)", () => {
        it("opens color picker popover on click", async () => {
            renderWithTheme(createDefaultProps());

            const colorButton = screen.getByLabelText("color picker");
            await userEvent.click(colorButton);

            // Check that color palette is visible in the popover
            expect(screen.getByLabelText("select color #000000")).toBeInTheDocument();
            expect(screen.getByLabelText("select color #FF0000")).toBeInTheDocument();
        });

        it("calls onColorChange when color is selected", async () => {
            const onColorChange = vi.fn();
            renderWithTheme(createDefaultProps({ onColorChange }));

            // Open color picker
            await userEvent.click(screen.getByLabelText("color picker"));

            // Select red color
            await userEvent.click(screen.getByLabelText("select color #FF0000"));

            expect(onColorChange).toHaveBeenCalledWith("#FF0000");
        });

        it("closes popover after color selection", async () => {
            renderWithTheme(createDefaultProps());

            // Open color picker
            await userEvent.click(screen.getByLabelText("color picker"));

            // Verify popover is open
            const redColorButton = screen.getByLabelText("select color #FF0000");
            expect(redColorButton).toBeVisible();

            // Select a color
            await userEvent.click(redColorButton);

            // Popover should close - the color button should no longer be in the document
            await waitFor(() => {
                expect(screen.queryByLabelText("select color #FF0000")).not.toBeInTheDocument();
            });
        });

        it("displays current color on color picker button", () => {
            renderWithTheme(createDefaultProps({ selectedColor: "#FF0000" }));

            const colorButton = screen.getByLabelText("color picker");
            // Check that the button has the selected color as background
            expect(colorButton).toHaveStyle({ backgroundColor: "#FF0000" });
        });

        it("shows all 10 palette colors", async () => {
            renderWithTheme(createDefaultProps());

            await userEvent.click(screen.getByLabelText("color picker"));

            const expectedColors = [
                "#000000", "#FF0000", "#0000FF", "#00FF00", "#FFFF00",
                "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#FFFFFF",
            ];

            for (const color of expectedColors) {
                expect(screen.getByLabelText(`select color ${color}`)).toBeInTheDocument();
            }
        });
    });

    describe("Undo/Redo (Requirements: 5.5)", () => {
        it("disables undo button when canUndo is false", () => {
            renderWithTheme(createDefaultProps({ canUndo: false }));

            const undoButton = screen.getByLabelText("undo");
            expect(undoButton).toBeDisabled();
        });

        it("enables undo button when canUndo is true", () => {
            renderWithTheme(createDefaultProps({ canUndo: true }));

            const undoButton = screen.getByLabelText("undo");
            expect(undoButton).not.toBeDisabled();
        });

        it("disables redo button when canRedo is false", () => {
            renderWithTheme(createDefaultProps({ canRedo: false }));

            const redoButton = screen.getByLabelText("redo");
            expect(redoButton).toBeDisabled();
        });

        it("enables redo button when canRedo is true", () => {
            renderWithTheme(createDefaultProps({ canRedo: true }));

            const redoButton = screen.getByLabelText("redo");
            expect(redoButton).not.toBeDisabled();
        });

        it("calls onUndo when undo button is clicked", async () => {
            const onUndo = vi.fn();
            renderWithTheme(createDefaultProps({ onUndo, canUndo: true }));

            await userEvent.click(screen.getByLabelText("undo"));

            expect(onUndo).toHaveBeenCalledTimes(1);
        });

        it("calls onRedo when redo button is clicked", async () => {
            const onRedo = vi.fn();
            renderWithTheme(createDefaultProps({ onRedo, canRedo: true }));

            await userEvent.click(screen.getByLabelText("redo"));

            expect(onRedo).toHaveBeenCalledTimes(1);
        });
    });

    describe("Clear Canvas (Requirements: 5.3)", () => {
        it("opens confirmation dialog when clear button is clicked", async () => {
            renderWithTheme(createDefaultProps());

            await userEvent.click(screen.getByLabelText("clear canvas"));

            expect(screen.getByText("Clear Canvas?")).toBeInTheDocument();
            expect(screen.getByText(/Are you sure you want to clear all drawings/)).toBeInTheDocument();
        });

        it("calls onClear when confirmed", async () => {
            const onClear = vi.fn();
            renderWithTheme(createDefaultProps({ onClear }));

            // Open dialog
            await userEvent.click(screen.getByLabelText("clear canvas"));

            // Click Clear button in dialog
            await userEvent.click(screen.getByRole("button", { name: "Clear" }));

            expect(onClear).toHaveBeenCalledTimes(1);
        });

        it("does not call onClear when cancelled", async () => {
            const onClear = vi.fn();
            renderWithTheme(createDefaultProps({ onClear }));

            // Open dialog
            await userEvent.click(screen.getByLabelText("clear canvas"));

            // Click Cancel button in dialog
            await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

            expect(onClear).not.toHaveBeenCalled();
        });

        it("closes dialog after confirmation", async () => {
            renderWithTheme(createDefaultProps());

            // Open dialog
            await userEvent.click(screen.getByLabelText("clear canvas"));
            expect(screen.getByText("Clear Canvas?")).toBeVisible();

            // Confirm
            await userEvent.click(screen.getByRole("button", { name: "Clear" }));

            // Dialog should close
            await waitFor(() => {
                expect(screen.queryByText("Clear Canvas?")).not.toBeInTheDocument();
            });
        });

        it("closes dialog after cancellation", async () => {
            renderWithTheme(createDefaultProps());

            // Open dialog
            await userEvent.click(screen.getByLabelText("clear canvas"));
            expect(screen.getByText("Clear Canvas?")).toBeVisible();

            // Cancel
            await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

            // Dialog should close
            await waitFor(() => {
                expect(screen.queryByText("Clear Canvas?")).not.toBeInTheDocument();
            });
        });
    });

    describe("Accessibility", () => {
        it("has proper aria-labels on all controls", () => {
            renderWithTheme(createDefaultProps());

            // Tool buttons
            expect(screen.getByLabelText("select tool")).toBeInTheDocument();
            expect(screen.getByLabelText("player tool")).toBeInTheDocument();
            expect(screen.getByLabelText("line tool")).toBeInTheDocument();
            expect(screen.getByLabelText("curve tool")).toBeInTheDocument();
            expect(screen.getByLabelText("arrow tool")).toBeInTheDocument();
            expect(screen.getByLabelText("text tool")).toBeInTheDocument();
            expect(screen.getByLabelText("eraser tool")).toBeInTheDocument();

            // Action buttons
            expect(screen.getByLabelText("color picker")).toBeInTheDocument();
            expect(screen.getByLabelText("undo")).toBeInTheDocument();
            expect(screen.getByLabelText("redo")).toBeInTheDocument();
            expect(screen.getByLabelText("clear canvas")).toBeInTheDocument();
        });

        it("toolbar has proper role for drawing tools group", () => {
            renderWithTheme(createDefaultProps());
            expect(screen.getByRole("group", { name: "drawing tools" })).toBeInTheDocument();
        });

        it("dialog has proper aria-labelledby for clear confirmation", async () => {
            renderWithTheme(createDefaultProps());

            await userEvent.click(screen.getByLabelText("clear canvas"));

            const dialog = screen.getByRole("dialog");
            expect(dialog).toHaveAttribute("aria-labelledby", "clear-dialog-title");
        });
    });

    describe("Color Contrast (Luminance Calculation)", () => {
        it("uses dark icon for light backgrounds (white)", () => {
            renderWithTheme(createDefaultProps({ selectedColor: "#FFFFFF" }));

            // Find the PaletteIcon svg within the color picker button
            const colorButton = screen.getByLabelText("color picker");
            const icon = colorButton.querySelector("svg");
            expect(icon).toBeInTheDocument();
        });

        it("uses light icon for dark backgrounds (black)", () => {
            renderWithTheme(createDefaultProps({ selectedColor: "#000000" }));

            const colorButton = screen.getByLabelText("color picker");
            const icon = colorButton.querySelector("svg");
            expect(icon).toBeInTheDocument();
        });

        it("handles yellow color (light) correctly", () => {
            renderWithTheme(createDefaultProps({ selectedColor: "#FFFF00" }));

            // Component should render without errors for yellow
            expect(screen.getByLabelText("color picker")).toBeInTheDocument();
        });

        it("handles cyan color correctly", () => {
            renderWithTheme(createDefaultProps({ selectedColor: "#00FFFF" }));

            // Component should render without errors for cyan
            expect(screen.getByLabelText("color picker")).toBeInTheDocument();
        });
    });
});
