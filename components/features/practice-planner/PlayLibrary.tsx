"use client";

/**
 * PlayLibrary Component
 *
 * Displays saved plays with search, filtering, and management capabilities.
 * Supports both selection mode (for adding to sessions) and management mode (for library management).
 *
 * Requirements: 4.2, 4.3, 4.5
 */

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Grid,
    Card,
    CardContent,
    CardMedia,
    CardActions,
    Typography,
    Button,
    IconButton,
    TextField,
    InputAdornment,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Pagination,
    Stack,
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import {
    Search as SearchIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import Image from "next/image";
import { SavedPlay } from "@/types/practice-planner";
import { getPlaysByTeam, deletePlay } from "@/lib/actions/plays";
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth } from "date-fns";

/**
 * Props for the PlayLibrary component
 */
export interface PlayLibraryProps {
    teamId: string;
    onSelectPlay?: (play: SavedPlay) => void;
    onEditPlay?: (playId: string) => void;
    mode?: "select" | "manage";
}

/**
 * Props for the PlayCard component
 */
interface PlayCardProps {
    play: SavedPlay;
    mode: "select" | "manage";
    isSelected: boolean;
    onSelect: (play: SavedPlay) => void;
    onEdit?: (playId: string) => void;
    onDelete?: (playId: string) => void;
}

/**
 * PlayCard Component
 *
 * Individual play card showing thumbnail, name, and description
 * Requirements: 4.2
 */
function PlayCard({
    play,
    mode,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
}: PlayCardProps) {
    const theme = useTheme();

    return (
        <Card
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                cursor: mode === "select" ? "pointer" : "default",
                border: isSelected ? `2px solid ${theme.palette.primary.main}` : "1px solid",
                borderColor: isSelected ? "primary.main" : "divider",
                transition: "all 0.2s",
                "&:hover": mode === "select"
                    ? {
                        transform: "translateY(-4px)",
                        boxShadow: theme.shadows[4],
                    }
                    : {},
            }}
            onClick={() => mode === "select" && onSelect(play)}
        >
            {/* Thumbnail */}
            {/* Requirements: 4.2 - Display play thumbnails */}
            <CardMedia
                component="div"
                sx={{
                    height: 200,
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                }}
            >
                {play.thumbnail ? (
                    <Image
                        src={play.thumbnail}
                        alt={play.name}
                        fill
                        style={{ objectFit: "contain" }}
                        unoptimized // Base64 images don't need optimization
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        No preview
                    </Typography>
                )}
                {isSelected && (
                    <Chip
                        label="Selected"
                        color="primary"
                        size="small"
                        sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                        }}
                    />
                )}
            </CardMedia>

            {/* Content */}
            <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h3" gutterBottom noWrap>
                    {play.name}
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        mb: 1,
                    }}
                >
                    {play.description || "No description"}
                </Typography>

                {/* Metadata */}
                {/* Requirements: 4.5 - Show play metadata */}
                <Stack direction="row" spacing={1} flexWrap="wrap" gap={0.5}>
                    <Typography variant="caption" color="text.secondary">
                        Created {formatDistanceToNow(new Date(play.createdAt), { addSuffix: true })}
                    </Typography>
                    {play.updatedAt && new Date(play.updatedAt).getTime() !== new Date(play.createdAt).getTime() && (
                        <Typography variant="caption" color="text.secondary">
                            • Updated {formatDistanceToNow(new Date(play.updatedAt), { addSuffix: true })}
                        </Typography>
                    )}
                </Stack>
            </CardContent>

            {/* Actions */}
            {/* Requirements: 4.5 - Add edit and delete buttons in manage mode */}
            {mode === "manage" && (
                <CardActions sx={{ justifyContent: "flex-end", pt: 0 }}>
                    {onEdit && (
                        <IconButton
                            size="small"
                            color="primary"
                            onClick={() => onEdit(play.id)}
                            aria-label={`Edit ${play.name}`}
                        >
                            <EditIcon />
                        </IconButton>
                    )}
                    {onDelete && (
                        <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDelete(play.id)}
                            aria-label={`Delete ${play.name}`}
                        >
                            <DeleteIcon />
                        </IconButton>
                    )}
                </CardActions>
            )}
        </Card>
    );
}

/**
 * PlayLibrary Component
 *
 * Main library component with grid layout, search, and filtering
 * Requirements: 4.2, 4.3, 4.5
 */
export function PlayLibrary({
    teamId,
    onSelectPlay,
    onEditPlay,
    mode = "manage",
}: PlayLibraryProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    // State
    const [plays, setPlays] = useState<SavedPlay[]>([]);
    const [filteredPlays, setFilteredPlays] = useState<SavedPlay[]>([]);
    const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [playToDelete, setPlayToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Pagination state
    // Requirements: 4.2 - Pagination for large libraries (20 per page)
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const playsPerPage = 20;

    /**
     * Load plays from the server
     * Requirements: 4.2
     */
    const loadPlays = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await getPlaysByTeam({
                teamId,
                isTemplate: true, // Only load library plays
                page: currentPage,
                limit: playsPerPage,
            });

            if (result.success) {
                const playsData = result.data.plays.map((play) => ({
                    ...play,
                    playData: { players: [], drawings: [], annotations: [] }, // Will be loaded when needed
                })) as SavedPlay[];

                setPlays(playsData);
                setFilteredPlays(playsData);
                setTotalPages(Math.ceil(result.data.total / playsPerPage));
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error("Error loading plays:", err);
            setError("Failed to load plays. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [teamId, currentPage]);

    // Load plays on mount and when page changes
    useEffect(() => {
        loadPlays();
    }, [loadPlays]);

    /**
     * Handle search query and date filter changes
     * Requirements: 8.4 - Search by play name, filter by creation date
     */
    useEffect(() => {
        let filtered = plays;

        // Apply date filter
        // Requirements: 8.4 - Filter by creation date
        if (dateFilter !== "all") {
            filtered = filtered.filter((play) => {
                const createdAt = new Date(play.createdAt);
                switch (dateFilter) {
                    case "today":
                        return isToday(createdAt);
                    case "week":
                        return isThisWeek(createdAt);
                    case "month":
                        return isThisMonth(createdAt);
                    default:
                        return true;
                }
            });
        }

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (play) =>
                    play.name.toLowerCase().includes(query) ||
                    play.description?.toLowerCase().includes(query)
            );
        }

        setFilteredPlays(filtered);
    }, [searchQuery, dateFilter, plays]);

    /**
     * Handle play selection
     * Requirements: 4.3
     */
    const handleSelectPlay = useCallback(
        (play: SavedPlay) => {
            if (mode === "select") {
                setSelectedPlayId(play.id);
                onSelectPlay?.(play);
            }
        },
        [mode, onSelectPlay]
    );

    /**
     * Handle delete button click
     * Requirements: 4.5
     */
    const handleDeleteClick = useCallback((playId: string) => {
        setPlayToDelete(playId);
        setDeleteDialogOpen(true);
    }, []);

    /**
     * Handle delete confirmation
     * Requirements: 4.5 - Delete with confirmation dialog
     */
    const handleDeleteConfirm = useCallback(async () => {
        if (!playToDelete) return;

        setIsDeleting(true);
        setError(null);

        try {
            const result = await deletePlay({
                id: playToDelete,
                teamId,
            });

            if (result.success) {
                // Reload plays after deletion
                await loadPlays();
                setDeleteDialogOpen(false);
                setPlayToDelete(null);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error("Error deleting play:", err);
            setError("Failed to delete play. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    }, [playToDelete, teamId, loadPlays]);

    /**
     * Handle delete dialog close
     */
    const handleDeleteCancel = useCallback(() => {
        setDeleteDialogOpen(false);
        setPlayToDelete(null);
    }, []);

    /**
     * Handle page change
     * Requirements: 4.2 - Pagination
     */
    const handlePageChange = useCallback(
        (_event: React.ChangeEvent<unknown>, page: number) => {
            setCurrentPage(page);
        },
        []
    );

    return (
        <Box sx={{ p: isMobile ? 2 : 3 }}>
            {/* Header */}
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                mb={3}
            >
                <Typography variant="h5" component="h2">
                    Play Library
                </Typography>
            </Stack>

            {/* Search and Filter Bar */}
            {/* Requirements: 8.4 - Search input for play names, filter by creation date */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ mb: 3 }}
            >
                <TextField
                    fullWidth
                    placeholder="Search plays by name or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />
                {/* Requirements: 8.4 - Filter by creation date */}
                <FormControl sx={{ minWidth: { xs: "100%", sm: 180 } }}>
                    <InputLabel id="date-filter-label">Date Filter</InputLabel>
                    <Select
                        labelId="date-filter-label"
                        id="date-filter"
                        value={dateFilter}
                        label="Date Filter"
                        onChange={(e: SelectChangeEvent) => setDateFilter(e.target.value as typeof dateFilter)}
                    >
                        <MenuItem value="all">All Time</MenuItem>
                        <MenuItem value="today">Today</MenuItem>
                        <MenuItem value="week">This Week</MenuItem>
                        <MenuItem value="month">This Month</MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        minHeight: 400,
                    }}
                >
                    <CircularProgress />
                </Box>
            )}

            {/* Empty State */}
            {/* Requirements: 4.2 - Empty state for no plays */}
            {!isLoading && filteredPlays.length === 0 && (
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 400,
                        textAlign: "center",
                        p: 3,
                    }}
                >
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        {searchQuery || dateFilter !== "all"
                            ? "No plays found"
                            : "No plays in your library yet"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        {searchQuery || dateFilter !== "all"
                            ? "Try adjusting your search or filter settings"
                            : "Create your first play to get started"}
                    </Typography>
                </Box>
            )}

            {/* Play Grid */}
            {/* Requirements: 4.2 - Responsive grid for play thumbnails */}
            {!isLoading && filteredPlays.length > 0 && (
                <>
                    <Grid container spacing={3}>
                        {filteredPlays.map((play) => (
                            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={play.id}>
                                <PlayCard
                                    play={play}
                                    mode={mode}
                                    isSelected={selectedPlayId === play.id}
                                    onSelect={handleSelectPlay}
                                    onEdit={onEditPlay}
                                    onDelete={handleDeleteClick}
                                />
                            </Grid>
                        ))}
                    </Grid>

                    {/* Pagination */}
                    {/* Requirements: 4.2 - Pagination for large libraries */}
                    {totalPages > 1 && (
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                mt: 4,
                            }}
                        >
                            <Pagination
                                count={totalPages}
                                page={currentPage}
                                onChange={handlePageChange}
                                color="primary"
                                size={isMobile ? "small" : "medium"}
                            />
                        </Box>
                    )}
                </>
            )}

            {/* Delete Confirmation Dialog */}
            {/* Requirements: 4.5 - Delete with confirmation dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
                aria-labelledby="delete-dialog-title"
                aria-describedby="delete-dialog-description"
            >
                <DialogTitle id="delete-dialog-title">Delete Play?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-dialog-description">
                        Are you sure you want to delete this play from your library? This
                        action cannot be undone. Note that any practice sessions using
                        this play will retain their own copies.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteCancel} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        color="error"
                        variant="contained"
                        disabled={isDeleting}
                        startIcon={
                            isDeleting ? (
                                <CircularProgress size={20} color="inherit" />
                            ) : (
                                <DeleteIcon />
                            )
                        }
                    >
                        {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
