/**
 * Tests for PlayLibrary component
 *
 * Comprehensive tests covering library display, search, filtering,
 * pagination, play selection, and management (edit/delete).
 *
 * Requirements: 4.2, 4.3, 4.5, 8.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayLibrary, PlayLibraryProps } from "@/components/features/practice-planner/PlayLibrary";

import { getPlaysByTeam, deletePlay } from "@/lib/actions/plays";

// Mock the server actions
vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn(),
    deletePlay: vi.fn(),
}));

// Cast to mock types for proper typing
const mockGetPlaysByTeam = getPlaysByTeam as ReturnType<typeof vi.fn>;
const mockDeletePlay = deletePlay as ReturnType<typeof vi.fn>;

// Create a theme for consistent testing
const theme = createTheme();

// Helper to render component with theme
const renderWithTheme = (props: PlayLibraryProps) => {
    return render(
        <ThemeProvider theme={theme}>
            <PlayLibrary {...props} />
        </ThemeProvider>
    );
};

// Type for mock play data matching server action return type
type MockPlayData = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    isTemplate: boolean;
    createdAt: Date;
    updatedAt: Date;
};

// Sample play data factory for mock responses
const createMockPlayData = (overrides?: Partial<MockPlayData>): MockPlayData => ({
    id: `play-${Math.random().toString(36).slice(2, 9)}`,
    name: "Power Play Setup",
    description: "Standard power play formation",
    thumbnail: "data:image/png;base64,mockBase64Data",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    updatedAt: new Date("2025-01-15T10:00:00Z"),
    isTemplate: true,
    ...overrides,
});

// Helper to create mock response with proper structure
const createMockResponse = (plays: MockPlayData[], total: number, page = 1, limit = 20) => ({
    success: true as const,
    data: {
        plays,
        total,
        page,
        limit,
    },
});

// Default props factory
const createDefaultProps = (overrides?: Partial<PlayLibraryProps>): PlayLibraryProps => ({
    teamId: "team-1",
    ...overrides,
});

describe("PlayLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default successful response with no plays
        mockGetPlaysByTeam.mockResolvedValue(createMockResponse([], 0));
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("Rendering", () => {
        it("renders the library header", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Play Library")).toBeInTheDocument();
            });
        });

        it("renders search input", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(
                    screen.getByPlaceholderText("Search plays by name or description...")
                ).toBeInTheDocument();
            });
        });

        it("renders date filter dropdown", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByLabelText("Date Filter")).toBeInTheDocument();
            });
        });

        it("shows loading state initially", () => {
            renderWithTheme(createDefaultProps());
            expect(screen.getByRole("progressbar")).toBeInTheDocument();
        });
    });

    describe("Data Loading (Requirements: 4.2)", () => {
        it("calls getPlaysByTeam on mount", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(mockGetPlaysByTeam).toHaveBeenCalledWith({
                    teamId: "team-1",
                    isTemplate: true,
                    page: 1,
                    limit: 20,
                });
            });
        });

        it("displays plays after loading", async () => {
            const mockPlays = [
                createMockPlayData({ id: "play-1", name: "Breakout Play" }),
                createMockPlayData({ id: "play-2", name: "Forechecking Drill" }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 2));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Breakout Play")).toBeInTheDocument();
                expect(screen.getByText("Forechecking Drill")).toBeInTheDocument();
            });
        });

        it("displays error when loading fails", async () => {
            mockGetPlaysByTeam.mockResolvedValue({
                success: false,
                error: "Failed to load plays",
            });

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Failed to load plays")).toBeInTheDocument();
            });
        });

        it("handles network errors gracefully", async () => {
            mockGetPlaysByTeam.mockRejectedValue(new Error("Network error"));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(
                    screen.getByText("Failed to load plays. Please try again.")
                ).toBeInTheDocument();
            });
        });
    });

    describe("Empty State (Requirements: 4.2)", () => {
        it("shows empty state when no plays exist", async () => {
            mockGetPlaysByTeam.mockResolvedValue(createMockResponse([], 0));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(
                    screen.getByText("No plays in your library yet")
                ).toBeInTheDocument();
                expect(
                    screen.getByText("Create your first play to get started")
                ).toBeInTheDocument();
            });
        });

        it("shows no results message when search returns nothing", async () => {
            const mockPlays = [createMockPlayData({ name: "Power Play" })];
            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play")).toBeInTheDocument();
            });

            // Search for non-existent play
            const searchInput = screen.getByPlaceholderText(
                "Search plays by name or description..."
            );
            await userEvent.type(searchInput, "xyz123");

            await waitFor(() => {
                expect(screen.getByText("No plays found")).toBeInTheDocument();
                expect(
                    screen.getByText("Try adjusting your search or filter settings")
                ).toBeInTheDocument();
            });
        });
    });

    describe("Search and Filtering (Requirements: 8.4)", () => {
        beforeEach(() => {
            const mockPlays = [
                createMockPlayData({
                    id: "play-1",
                    name: "Power Play Setup",
                    description: "Standard power play",
                    createdAt: new Date(),
                }),
                createMockPlayData({
                    id: "play-2",
                    name: "Penalty Kill Formation",
                    description: "Defensive formation",
                    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                }),
                createMockPlayData({
                    id: "play-3",
                    name: "Breakout Pattern",
                    description: "Quick transition play",
                    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
                }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 3));
        });

        it("filters plays by name search", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            const searchInput = screen.getByPlaceholderText(
                "Search plays by name or description..."
            );
            await userEvent.type(searchInput, "Power");

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
                expect(
                    screen.queryByText("Penalty Kill Formation")
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByText("Breakout Pattern")
                ).not.toBeInTheDocument();
            });
        });

        it("filters plays by description search", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            const searchInput = screen.getByPlaceholderText(
                "Search plays by name or description..."
            );
            await userEvent.type(searchInput, "Defensive");

            await waitFor(() => {
                expect(screen.getByText("Penalty Kill Formation")).toBeInTheDocument();
                expect(
                    screen.queryByText("Power Play Setup")
                ).not.toBeInTheDocument();
            });
        });

        it("search is case-insensitive", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            const searchInput = screen.getByPlaceholderText(
                "Search plays by name or description..."
            );
            await userEvent.type(searchInput, "power play");

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });
        });

        it("filters by date - Today", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            // Open date filter dropdown
            const dateFilter = screen.getByLabelText("Date Filter");
            await userEvent.click(dateFilter);

            // Select "Today"
            const todayOption = screen.getByRole("option", { name: "Today" });
            await userEvent.click(todayOption);

            // Only "Power Play Setup" was created today
            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
                expect(
                    screen.queryByText("Penalty Kill Formation")
                ).not.toBeInTheDocument();
            });
        });

        it("combines search and date filter", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            // Apply date filter first
            const dateFilter = screen.getByLabelText("Date Filter");
            await userEvent.click(dateFilter);
            await userEvent.click(screen.getByRole("option", { name: "All Time" }));

            // Then search
            const searchInput = screen.getByPlaceholderText(
                "Search plays by name or description..."
            );
            await userEvent.type(searchInput, "Pattern");

            await waitFor(() => {
                expect(screen.getByText("Breakout Pattern")).toBeInTheDocument();
                expect(
                    screen.queryByText("Power Play Setup")
                ).not.toBeInTheDocument();
            });
        });
    });

    describe("Play Selection Mode (Requirements: 4.3)", () => {
        beforeEach(() => {
            const mockPlays = [
                createMockPlayData({ id: "play-1", name: "Power Play Setup" }),
                createMockPlayData({ id: "play-2", name: "Penalty Kill" }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 2));
        });

        it("calls onSelectPlay when play is clicked in select mode", async () => {
            const onSelectPlay = vi.fn();
            renderWithTheme(
                createDefaultProps({ mode: "select", onSelectPlay })
            );

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(screen.getByText("Power Play Setup"));

            expect(onSelectPlay).toHaveBeenCalledWith(
                expect.objectContaining({ name: "Power Play Setup" })
            );
        });

        it("shows selected state on play card", async () => {
            const onSelectPlay = vi.fn();
            renderWithTheme(
                createDefaultProps({ mode: "select", onSelectPlay })
            );

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(screen.getByText("Power Play Setup"));

            // Check for "Selected" chip
            await waitFor(() => {
                expect(screen.getByText("Selected")).toBeInTheDocument();
            });
        });

        it("does not call onSelectPlay in manage mode", async () => {
            const onSelectPlay = vi.fn();
            renderWithTheme(
                createDefaultProps({ mode: "manage", onSelectPlay })
            );

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(screen.getByText("Power Play Setup"));

            expect(onSelectPlay).not.toHaveBeenCalled();
        });
    });

    describe("Play Management Mode (Requirements: 4.5)", () => {
        beforeEach(() => {
            const mockPlays = [
                createMockPlayData({ id: "play-1", name: "Power Play Setup" }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));
        });

        it("shows edit button in manage mode", async () => {
            const onEditPlay = vi.fn();
            renderWithTheme(createDefaultProps({ mode: "manage", onEditPlay }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            expect(
                screen.getByLabelText("Edit Power Play Setup")
            ).toBeInTheDocument();
        });

        it("shows delete button in manage mode", async () => {
            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            expect(
                screen.getByLabelText("Delete Power Play Setup")
            ).toBeInTheDocument();
        });

        it("calls onEditPlay when edit button is clicked", async () => {
            const onEditPlay = vi.fn();
            renderWithTheme(createDefaultProps({ mode: "manage", onEditPlay }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(screen.getByLabelText("Edit Power Play Setup"));

            expect(onEditPlay).toHaveBeenCalledWith("play-1");
        });

        it("opens delete confirmation dialog", async () => {
            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(
                screen.getByLabelText("Delete Power Play Setup")
            );

            expect(screen.getByText("Delete Play?")).toBeInTheDocument();
            expect(
                screen.getByText(/Are you sure you want to delete this play/)
            ).toBeInTheDocument();
        });

        it("cancels delete when Cancel is clicked", async () => {
            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(
                screen.getByLabelText("Delete Power Play Setup")
            );
            await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

            // Dialog should close
            await waitFor(() => {
                expect(screen.queryByText("Delete Play?")).not.toBeInTheDocument();
            });

            // deletePlay should not be called
            expect(mockDeletePlay).not.toHaveBeenCalled();
        });

        it("deletes play when confirmed", async () => {
            mockDeletePlay.mockResolvedValue({ success: true, data: { id: "play-1" } });

            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(
                screen.getByLabelText("Delete Power Play Setup")
            );
            await userEvent.click(screen.getByRole("button", { name: "Delete" }));

            await waitFor(() => {
                expect(mockDeletePlay).toHaveBeenCalledWith({
                    id: "play-1",
                    teamId: "team-1",
                });
            });
        });

        it("shows error when delete fails", async () => {
            mockDeletePlay.mockResolvedValue({
                success: false,
                error: "Permission denied",
            });

            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(
                screen.getByLabelText("Delete Power Play Setup")
            );
            await userEvent.click(screen.getByRole("button", { name: "Delete" }));

            await waitFor(() => {
                expect(screen.getByText("Permission denied")).toBeInTheDocument();
            });
        });

        it("does not show edit/delete buttons in select mode", async () => {
            renderWithTheme(createDefaultProps({ mode: "select" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            expect(
                screen.queryByLabelText("Edit Power Play Setup")
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText("Delete Power Play Setup")
            ).not.toBeInTheDocument();
        });
    });

    describe("Pagination (Requirements: 4.2)", () => {
        it("shows pagination when there are more than 20 plays", async () => {
            mockGetPlaysByTeam.mockResolvedValue(
                createMockResponse(
                    Array.from({ length: 20 }, (_, i) =>
                        createMockPlayData({ id: `play-${i}`, name: `Play ${i + 1}` })
                    ),
                    45 // 3 pages
                )
            );

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByRole("navigation")).toBeInTheDocument();
            });
        });

        it("does not show pagination for small libraries", async () => {
            mockGetPlaysByTeam.mockResolvedValue(
                createMockResponse([createMockPlayData({ name: "Only Play" })], 1)
            );

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Only Play")).toBeInTheDocument();
            });

            expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
        });

        it("changes page when pagination is clicked", async () => {
            mockGetPlaysByTeam.mockResolvedValue(
                createMockResponse(
                    Array.from({ length: 20 }, (_, i) =>
                        createMockPlayData({ id: `play-${i}`, name: `Play ${i + 1}` })
                    ),
                    45
                )
            );

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Play 1")).toBeInTheDocument();
            });

            // Click page 2
            const page2Button = screen.getByRole("button", { name: "Go to page 2" });
            await userEvent.click(page2Button);

            // Should request page 2
            await waitFor(() => {
                expect(mockGetPlaysByTeam).toHaveBeenCalledWith(
                    expect.objectContaining({ page: 2 })
                );
            });
        });
    });

    describe("Play Card Display", () => {
        beforeEach(() => {
            const mockPlays = [
                createMockPlayData({
                    id: "play-1",
                    name: "Power Play Setup",
                    description: "A detailed power play formation for 5v4 situations",
                    thumbnail: "data:image/png;base64,testThumbnail",
                    createdAt: new Date("2025-01-15T10:00:00Z"),
                    updatedAt: new Date("2025-01-16T14:30:00Z"),
                }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));
        });

        it("displays play name", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });
        });

        it("displays play description", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(
                    screen.getByText(/A detailed power play formation/)
                ).toBeInTheDocument();
            });
        });

        it("displays created date", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                // date-fns formatDistanceToNow will show relative time
                expect(screen.getByText(/Created/)).toBeInTheDocument();
            });
        });

        it("displays updated date when different from created", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText(/Updated/)).toBeInTheDocument();
            });
        });

        it("displays thumbnail image", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                const images = screen.getAllByRole("img");
                expect(images.length).toBeGreaterThan(0);
            });
        });

        it("shows 'No preview' when thumbnail is missing", async () => {
            const mockPlays = [
                createMockPlayData({
                    id: "play-1",
                    name: "No Thumbnail Play",
                    thumbnail: null,
                }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("No preview")).toBeInTheDocument();
            });
        });

        it("shows 'No description' when description is missing", async () => {
            const mockPlays = [
                createMockPlayData({
                    id: "play-1",
                    name: "No Description Play",
                    description: null,
                }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("No description")).toBeInTheDocument();
            });
        });
    });

    describe("Error Handling", () => {
        it("allows dismissing error alert", async () => {
            mockGetPlaysByTeam.mockResolvedValue({
                success: false,
                error: "Server error occurred",
            });

            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByText("Server error occurred")).toBeInTheDocument();
            });

            // Close the alert
            const closeButton = screen.getByRole("button", { name: "Close" });
            await userEvent.click(closeButton);

            await waitFor(() => {
                expect(
                    screen.queryByText("Server error occurred")
                ).not.toBeInTheDocument();
            });
        });

        it("reloads plays after successful delete", async () => {
            const mockPlays = [
                createMockPlayData({ id: "play-1", name: "To Be Deleted" }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));

            mockDeletePlay.mockResolvedValue({ success: true, data: { id: "play-1" } });

            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("To Be Deleted")).toBeInTheDocument();
            });

            // Clear mock call count
            mockGetPlaysByTeam.mockClear();

            // Delete the play
            await userEvent.click(screen.getByLabelText("Delete To Be Deleted"));
            await userEvent.click(screen.getByRole("button", { name: "Delete" }));

            // Should reload plays
            await waitFor(() => {
                expect(mockGetPlaysByTeam).toHaveBeenCalled();
            });
        });
    });

    describe("Accessibility", () => {
        beforeEach(() => {
            const mockPlays = [
                createMockPlayData({ id: "play-1", name: "Power Play Setup" }),
            ];

            mockGetPlaysByTeam.mockResolvedValue(createMockResponse(mockPlays, 1));
        });

        it("has accessible search input", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                const searchInput = screen.getByPlaceholderText(
                    "Search plays by name or description..."
                );
                expect(searchInput).toBeInTheDocument();
            });
        });

        it("has accessible date filter", async () => {
            renderWithTheme(createDefaultProps());

            await waitFor(() => {
                expect(screen.getByLabelText("Date Filter")).toBeInTheDocument();
            });
        });

        it("has accessible delete dialog", async () => {
            renderWithTheme(createDefaultProps({ mode: "manage" }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            await userEvent.click(screen.getByLabelText("Delete Power Play Setup"));

            const dialog = screen.getByRole("dialog");
            expect(dialog).toHaveAttribute(
                "aria-labelledby",
                "delete-dialog-title"
            );
            expect(dialog).toHaveAttribute(
                "aria-describedby",
                "delete-dialog-description"
            );
        });

        it("edit and delete buttons have descriptive labels", async () => {
            const onEditPlay = vi.fn();
            renderWithTheme(createDefaultProps({ mode: "manage", onEditPlay }));

            await waitFor(() => {
                expect(screen.getByText("Power Play Setup")).toBeInTheDocument();
            });

            expect(
                screen.getByLabelText("Edit Power Play Setup")
            ).toBeInTheDocument();
            expect(
                screen.getByLabelText("Delete Power Play Setup")
            ).toBeInTheDocument();
        });
    });
});
