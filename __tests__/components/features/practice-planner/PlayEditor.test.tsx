/**
 * Tests for PlayEditor component
 *
 * Tests covering play editor layout, metadata form, save functionality,
 * and library template option.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayEditor, PlayEditorProps } from "@/components/features/practice-planner/PlayEditor";
import { SavedPlay } from "@/types/practice-planner";

// Mock the thumbnail generator
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: vi.fn(() => "data:image/png;base64,mockThumbnail"),
}));

// Create a theme for consistent testing
const theme = createTheme();

// Helper to render component with theme
const renderWithTheme = (props: PlayEditorProps) => {
    return render(
        <ThemeProvider theme={theme}>
            <PlayEditor {...props} />
        </ThemeProvider>
    );
};

// Default props factory
const createDefaultProps = (overrides?: Partial<PlayEditorProps>): PlayEditorProps => ({
    teamId: "team-123",
    ...overrides,
});

describe("PlayEditor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Rendering", () => {
        it("renders the play editor with all sections", () => {
            renderWithTheme(createDefaultProps());

            // Check header
            expect(screen.getByText("Create New Play")).toBeInTheDocument();

            // Check metadata form
            expect(screen.getByLabelText(/Play Name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();

            // Check save to library checkbox
            expect(screen.getByLabelText(/Save to play library/i)).toBeInTheDocument();

            // Check save button
            expect(screen.getByRole("button", { name: /Save Play/i })).toBeInTheDocument();
        });

        it("renders 'Edit Play' header when editing existing play", () => {
            renderWithTheme(createDefaultProps({ playId: "play-123" }));

            expect(screen.getByText("Edit Play")).toBeInTheDocument();
        });

        it("populates form with initial data when provided", () => {
            const initialData: Partial<SavedPlay> = {
                name: "Test Play",
                description: "Test Description",
                isTemplate: true,
                playData: {
                    players: [],
                    drawings: [],
                    annotations: [],
                },
            };

            renderWithTheme(createDefaultProps({ initialData }));

            expect(screen.getByLabelText(/Play Name/i)).toHaveValue("Test Play");
            expect(screen.getByLabelText(/Description/i)).toHaveValue("Test Description");
            expect(screen.getByLabelText(/Save to play library/i)).toBeChecked();
        });
    });

    describe("Metadata Form", () => {
        it("allows entering play name", async () => {
            const user = userEvent.setup();
            renderWithTheme(createDefaultProps());

            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Power Play Setup");

            expect(nameInput).toHaveValue("Power Play Setup");
        });

        it("allows entering description", async () => {
            const user = userEvent.setup();
            renderWithTheme(createDefaultProps());

            const descInput = screen.getByLabelText(/Description/i);
            await user.type(descInput, "5v4 power play formation");

            expect(descInput).toHaveValue("5v4 power play formation");
        });

        it("shows character count for name field", () => {
            renderWithTheme(createDefaultProps());

            expect(screen.getByText("0/100 characters")).toBeInTheDocument();
        });

        it("shows character count for description field", () => {
            renderWithTheme(createDefaultProps());

            expect(screen.getByText("0/500 characters")).toBeInTheDocument();
        });

        it("allows toggling save to library checkbox", async () => {
            const user = userEvent.setup();
            renderWithTheme(createDefaultProps());

            const checkbox = screen.getByLabelText(/Save to play library/i);
            expect(checkbox).not.toBeChecked();

            await user.click(checkbox);
            expect(checkbox).toBeChecked();

            await user.click(checkbox);
            expect(checkbox).not.toBeChecked();
        });
    });

    describe("Save Functionality", () => {
        it("disables save button when name is empty", () => {
            renderWithTheme(createDefaultProps());

            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            expect(saveButton).toBeDisabled();
        });

        it("enables save button when name is provided", async () => {
            const user = userEvent.setup();
            renderWithTheme(createDefaultProps());

            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test Play");

            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            expect(saveButton).toBeEnabled();
        });

        it("calls onSave with correct data when save button is clicked", async () => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockResolvedValue(undefined);
            renderWithTheme(createDefaultProps({ onSave }));

            // Fill in form
            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test Play");

            const descInput = screen.getByLabelText(/Description/i);
            await user.type(descInput, "Test Description");

            const checkbox = screen.getByLabelText(/Save to play library/i);
            await user.click(checkbox);

            // Click save
            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            await user.click(saveButton);

            // Wait for save to complete
            await waitFor(() => {
                expect(onSave).toHaveBeenCalledTimes(1);
            });

            // Verify saved data
            const savedPlay = onSave.mock.calls[0][0] as SavedPlay;
            expect(savedPlay.name).toBe("Test Play");
            expect(savedPlay.description).toBe("Test Description");
            expect(savedPlay.isTemplate).toBe(true);
            expect(savedPlay.thumbnail).toBe("data:image/png;base64,mockThumbnail");
        });

        it("shows success message after successful save", async () => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockResolvedValue(undefined);
            renderWithTheme(createDefaultProps({ onSave }));

            // Fill in form
            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test Play");

            // Click save
            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            await user.click(saveButton);

            // Wait for success message
            await waitFor(() => {
                expect(screen.getByText("Play saved successfully!")).toBeInTheDocument();
            });
        });

        it("shows error message when save fails", async () => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockRejectedValue(new Error("Save failed"));
            renderWithTheme(createDefaultProps({ onSave }));

            // Fill in form
            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test Play");

            // Click save
            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            await user.click(saveButton);

            // Wait for error message
            await waitFor(() => {
                expect(screen.getByText("Save failed")).toBeInTheDocument();
            });
        });

        it("validates name is required", () => {
            const onSave = vi.fn();
            renderWithTheme(createDefaultProps({ onSave }));

            // Try to save without name (button should be disabled)
            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            expect(saveButton).toBeDisabled();

            // onSave should not be called
            expect(onSave).not.toHaveBeenCalled();
        });

        // Note: Length validation tests are not needed because MUI TextField
        // enforces maxLength at the browser level, preventing invalid input
    });

    describe("Cancel Functionality", () => {
        it("shows cancel button when onCancel is provided", () => {
            const onCancel = vi.fn();
            renderWithTheme(createDefaultProps({ onCancel }));

            expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
        });

        it("does not show cancel button when onCancel is not provided", () => {
            renderWithTheme(createDefaultProps());

            expect(screen.queryByRole("button", { name: /Cancel/i })).not.toBeInTheDocument();
        });

        it("calls onCancel when cancel button is clicked", async () => {
            const user = userEvent.setup();
            const onCancel = vi.fn();
            renderWithTheme(createDefaultProps({ onCancel }));

            const cancelButton = screen.getByRole("button", { name: /Cancel/i });
            await user.click(cancelButton);

            expect(onCancel).toHaveBeenCalledTimes(1);
        });
    });

    describe("Unsaved Changes", () => {
        it("shows unsaved changes indicator when form is modified", async () => {
            const user = userEvent.setup();
            renderWithTheme(createDefaultProps());

            // Modify form
            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test");

            // Check for unsaved changes indicator
            await waitFor(() => {
                expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
            });
        });

        it("clears unsaved changes indicator after successful save", async () => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockResolvedValue(undefined);
            renderWithTheme(createDefaultProps({ onSave }));

            // Modify form
            const nameInput = screen.getByLabelText(/Play Name/i);
            await user.type(nameInput, "Test Play");

            // Wait for unsaved changes indicator
            await waitFor(() => {
                expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
            });

            // Save
            const saveButton = screen.getByRole("button", { name: /Save Play/i });
            await user.click(saveButton);

            // Wait for save to complete and unsaved changes to clear
            await waitFor(() => {
                expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
            });
        });
    });
});
