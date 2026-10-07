"use client";

/**
 * PlayLibrary Component
 *
 * Displays saved plays with search, filtering, and management capabilities.
 * Supports both selection mode (for adding to sessions) and management mode (for library management).
 *
 * Requirements: 4.2, 4.3, 4.5
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
    Divider,
    Pagination,
    Stack,
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { SelectChangeEvent } from "@mui/material";
import {
    Search as SearchIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import { SavedPlay } from "@/types/practice-planner";
import { usePlannerPlatform, usePlannerStore, type PlannerStore } from "@/lib/planner-store";
import { STARTER_PLAYS, type StarterPlay } from "@/lib/data/starter-plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { STORED_THUMBNAIL_PIXEL_RATIO } from "@/lib/utils/thumbnail-rules";
import { formatDistanceToNow } from "date-fns";
import { useDebouncedCallback } from "use-debounce";
import { DrillFilterChips, type DrillFilters } from "./DrillFilterChips";
import { GoalieBadge } from "./GoalieBadge";
import { needsGoalie } from "@/lib/utils/drill-tags";
import { matchesAgeGroup, type AgeGroup } from "@/lib/utils/age-groups";
import { AgeFilter, AgeFilterEmpty } from "./AgeFilter";
import { useAgeFilter } from "./useAgeFilter";

/** The most rows one library query may ask for (getPlaysByTeamSchema). */
const NAMES_PAGE_SIZE = 100;

/** What a library load asks for: the tag chips plus the age filter (R3). */
type LibraryFilters = DrillFilters & { ageGroup?: AgeGroup };

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Every drill name in the team's library, whatever the current page, search
 * or filters, so a starter already copied stays hidden however large the
 * library grows. Pages through the unfiltered library query.
 */
async function loadLibraryNames(store: PlannerStore, teamId: string): Promise<Set<string> | null> {
    const names = new Set<string>();
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
        const result = await store.getPlaysByTeam({ teamId, isTemplate: true, page, limit: NAMES_PAGE_SIZE, dateFilter: "all" });
        if (!result.success) return null;
        for (const play of result.data.plays) names.add(nameKey(play.name));
        // Bounded by the first answer's total, so the loop always ends.
        if (page === 1) pages = Math.ceil(result.data.total / NAMES_PAGE_SIZE);
    }
    return names;
}

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
    isLoading?: boolean;
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
    isLoading,
    onSelect,
    onEdit,
    onDelete,
}: PlayCardProps) {
    const theme = useTheme();
    const { Image } = usePlannerPlatform();

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
                opacity: isLoading ? 0.7 : 1,
                "&:hover": mode === "select"
                    ? {
                        transform: "translateY(-4px)",
                        boxShadow: theme.shadows[4],
                    }
                    : {},
            }}
            onClick={() => mode === "select" && !isLoading && onSelect(play)}
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
                    <Image src={play.thumbnail} alt={play.name} fit="contain" />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        No preview
                    </Typography>
                )}
                {needsGoalie(play) && <GoalieBadge sx={{ position: "absolute", top: 8, left: 8 }} />}
                {isSelected && (
                    <Chip
                        label={isLoading ? "Loading..." : "Selected"}
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
                    {play.updatedAt && new Date(play.updatedAt) > new Date(play.createdAt) && (
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
 * Props for the StarterPlayCard component
 */
interface StarterPlayCardProps {
    starter: StarterPlay;
    thumbnail?: string;
    isAdding: boolean;
    disabled: boolean;
    onAdd: (starter: StarterPlay) => void;
}

/**
 * StarterPlayCard Component
 *
 * Card for a curated starter play that can be copied into the team's library
 */
function StarterPlayCard({
    starter,
    thumbnail,
    isAdding,
    disabled,
    onAdd,
}: StarterPlayCardProps) {
    const { Image } = usePlannerPlatform();
    return (
        <Card
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                border: "1px dashed",
                borderColor: "divider",
                opacity: isAdding ? 0.7 : 1,
            }}
        >
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
                {thumbnail ? (
                    <Image src={thumbnail} alt={starter.name} fit="contain" />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        No preview
                    </Typography>
                )}
                {needsGoalie(starter) && <GoalieBadge sx={{ position: "absolute", top: 8, left: 8 }} />}
                <Chip
                    label="Starter"
                    color="secondary"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                    }}
                />
            </CardMedia>

            <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h3" gutterBottom noWrap>
                    {starter.name}
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {starter.description}
                </Typography>
            </CardContent>

            <CardActions sx={{ justifyContent: "flex-end", pt: 0 }}>
                <Button
                    size="small"
                    disabled={disabled}
                    onClick={() => onAdd(starter)}
                    startIcon={
                        isAdding ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : (
                            <AddIcon />
                        )
                    }
                >
                    {isAdding ? "Adding..." : "Add to my library"}
                </Button>
            </CardActions>
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
    const store = usePlannerStore();
    const { navigate, routes } = usePlannerPlatform();

    // State
    const [plays, setPlays] = useState<SavedPlay[]>([]);
    const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
    const [filters, setFilters] = useState<DrillFilters>({});
    // Remembered on this device, and shared with the drill picker and the template picker (R3).
    const [ageFilter, setAgeFilter] = useAgeFilter();
    const queryFilters = useMemo<LibraryFilters>(() => (ageFilter ? { ...filters, ageGroup: ageFilter } : filters), [filters, ageFilter]);
    const filtersActive = Boolean(filters.focus || filters.goalies || ageFilter);
    // Only the latest load may set the grid: on the hosted page the remembered age arrives after
    // hydration, and a quick chip change can also leave an earlier, slower answer in flight.
    const latestLoad = useRef(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSelecting, setIsSelecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [playToDelete, setPlayToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Starter pack state (manage mode only)
    const [starterThumbnails, setStarterThumbnails] = useState<Record<string, string>>({});
    const [addingStarterId, setAddingStarterId] = useState<string | null>(null);
    const [copiedStarterNames, setCopiedStarterNames] = useState<Set<string>>(new Set());
    // Every drill name in the library; null until loaded (or if that fails).
    const [libraryNames, setLibraryNames] = useState<Set<string> | null>(null);
    const libraryNamesLoaded = useRef(false);
    // The latest names scan; an older or unmounted scan's answer is dropped.
    const namesScan = useRef(0);
    useEffect(() => () => {
        namesScan.current++;
    }, []);

    // Pagination state
    // Requirements: 4.2 - Pagination for large libraries (20 per page)
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const playsPerPage = 20;

    /**
     * The whole library's drill names, for the starter list (manage mode only).
     * An unfiltered first page that holds the whole library already has them;
     * otherwise this pages through the library in the background, so the grid
     * never waits on it. A failed scan keeps the names already known.
     */
    const refreshLibraryNames = useCallback((page: { plays: { name: string }[]; total: number } | null) => {
        if (mode !== "manage") return;
        libraryNamesLoaded.current = true;
        const scan = ++namesScan.current;
        if (page && page.total <= page.plays.length) {
            setLibraryNames(new Set(page.plays.map((play) => nameKey(play.name))));
            return;
        }
        loadLibraryNames(store, teamId)
            .catch((err: unknown) => {
                console.error("Error loading library names:", err);
                return null;
            })
            .then((next) => {
                if (scan !== namesScan.current) return;
                setLibraryNames((prev) => next ?? prev);
            });
    }, [mode, store, teamId]);

    /**
     * Load plays from the server with search and filter parameters
     * Requirements: 4.2, 8.4 - Server-side search and filtering
     */
    const loadPlays = useCallback(async (search: string, dateFilterValue: "all" | "today" | "week" | "month", drillFilters: LibraryFilters, refreshNames = false) => {
        const load = ++latestLoad.current;
        setIsLoading(true);
        setError(null);

        try {
            const result = await store.getPlaysByTeam({
                teamId,
                isTemplate: true, // Only load library plays
                page: currentPage,
                limit: playsPerPage,
                search: search.trim() || undefined,
                dateFilter: dateFilterValue,
                ...(drillFilters.focus && { focus: drillFilters.focus }),
                ...(drillFilters.goalies && { goalies: drillFilters.goalies }),
                ...(drillFilters.ageGroup && { ageGroup: drillFilters.ageGroup }),
            });
            if (load !== latestLoad.current) return;

            if (result.success) {
                const playsData = result.data.plays.map((play) => ({
                    ...play,
                    description: play.description ?? "",
                    thumbnail: play.thumbnail ?? "",
                    playData: createEmptyPlayData(), // Will be loaded when needed
                })) as SavedPlay[];

                setPlays(playsData);
                setTotalPages(Math.ceil(result.data.total / playsPerPage));
                if (refreshNames) {
                    const unfiltered = !search.trim() && dateFilterValue === "all" && !drillFilters.focus && !drillFilters.goalies && !drillFilters.ageGroup;
                    refreshLibraryNames(unfiltered && currentPage === 1 ? result.data : null);
                }
            } else {
                setError(result.error);
            }
        } catch (err) {
            if (load !== latestLoad.current) return;
            console.error("Error loading plays:", err);
            setError("Failed to load plays. Please try again.");
        } finally {
            if (load === latestLoad.current) setIsLoading(false);
        }
    }, [store, teamId, currentPage, refreshLibraryNames]);

    // Debounced search to avoid too many server requests
    const debouncedSearch = useDebouncedCallback(
        (search: string) => {
            setCurrentPage(1); // Reset to first page on search
            loadPlays(search, dateFilter, queryFilters);
        },
        300
    );

    // Load plays on mount and when page or a filter changes; the first load also reads the library's names
    useEffect(() => {
        loadPlays(searchQuery, dateFilter, queryFilters, !libraryNamesLoaded.current);
    }, [currentPage, dateFilter, queryFilters]); // eslint-disable-line react-hooks/exhaustive-deps

    // Render starter play thumbnails client-side once (manage mode only)
    useEffect(() => {
        if (mode !== "manage") return;

        const thumbnails: Record<string, string> = {};
        for (const starter of STARTER_PLAYS) {
            try {
                // At the stored 2×: "Add to my library" stores this same image.
                thumbnails[starter.id] = generateThumbnail(starter.playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO });
            } catch (err) {
                // Card falls back to "No preview"; play still saves without a thumbnail
                console.error(`Error generating thumbnail for ${starter.name}:`, err);
            }
        }
        setStarterThumbnails(thumbnails);
    }, [mode]);

    /**
     * Starter plays not yet copied into the team's library, matched by name
     * against the whole library (plus the loaded page and starters added this
     * session), then narrowed by the search and the drill-tag chips.
     */
    const visibleStarters = useMemo(() => {
        if (mode !== "manage") return [];

        const existingNames = new Set(plays.map((play) => nameKey(play.name)));
        libraryNames?.forEach((name) => existingNames.add(name));
        const query = searchQuery.trim().toLowerCase();

        return STARTER_PLAYS.filter((starter) => {
            const name = nameKey(starter.name);
            if (existingNames.has(name) || copiedStarterNames.has(name)) return false;
            if (
                query &&
                !name.includes(query) &&
                !starter.description.toLowerCase().includes(query)
            ) {
                return false;
            }
            if (filters.focus && starter.focus !== filters.focus) return false;
            if (filters.goalies && starter.goalies !== filters.goalies) return false;
            if (!matchesAgeGroup(starter.ageGroups, ageFilter)) return false;
            return true;
        });
    }, [mode, plays, libraryNames, copiedStarterNames, searchQuery, filters, ageFilter]);

    /**
     * Copy a starter play into the team's library as an editable template
     */
    const handleAddStarter = useCallback(
        async (starter: StarterPlay) => {
            setAddingStarterId(starter.id);
            setError(null);

            try {
                const result = await store.createPlay({
                    name: starter.name,
                    description: starter.description,
                    thumbnail: starterThumbnails[starter.id] || undefined,
                    playData: starter.playData,
                    focus: starter.focus,
                    goalies: starter.goalies,
                    ageGroups: [...starter.ageGroups],
                    isTemplate: true,
                    teamId,
                });

                if (result.success) {
                    setCopiedStarterNames((prev) => {
                        const next = new Set(prev);
                        next.add(nameKey(starter.name));
                        return next;
                    });
                    await loadPlays(searchQuery, dateFilter, queryFilters, true);
                } else {
                    setError(result.error);
                }
            } catch (err) {
                console.error("Error adding starter play:", err);
                setError("Failed to add starter play. Please try again.");
            } finally {
                setAddingStarterId(null);
            }
        },
        [store, starterThumbnails, teamId, loadPlays, searchQuery, dateFilter, queryFilters]
    );

    /**
     * Handle search input change
     */
    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);
        debouncedSearch(value);
    }, [debouncedSearch]);

    /**
     * Handle date filter change
     */
    const handleDateFilterChange = useCallback((e: SelectChangeEvent) => {
        const value = e.target.value as "all" | "today" | "week" | "month";
        setDateFilter(value);
        setCurrentPage(1); // Reset to first page on filter change
    }, []);

    /**
     * Handle a drill-tag chip change
     */
    const handleFiltersChange = useCallback((next: DrillFilters) => {
        setFilters(next);
        setCurrentPage(1); // a filtered result starts at its first page
    }, []);

    /**
     * Handle an age chip change (remembered on this device)
     */
    const handleAgeChange = useCallback((next: AgeGroup | null) => {
        setAgeFilter(next);
        setCurrentPage(1); // a filtered result starts at its first page
    }, [setAgeFilter]);

    /**
     * Handle play selection - fetch complete play data before calling onSelectPlay
     * Requirements: 4.3
     */
    const handleSelectPlay = useCallback(
        async (play: SavedPlay) => {
            if (mode === "select") {
                setSelectedPlayId(play.id);
                setIsSelecting(true);
                setError(null);

                try {
                    // Fetch complete play data from server
                    const result = await store.getPlayById({ id: play.id, teamId });
                    if (result.success) {
                        const fullPlay: SavedPlay = {
                            id: result.data.id,
                            name: result.data.name,
                            description: result.data.description ?? "",
                            thumbnail: result.data.thumbnail ?? "",
                            playData: result.data.playData,
                            focus: result.data.focus,
                            goalies: result.data.goalies,
                            ageGroups: result.data.ageGroups,
                            isTemplate: result.data.isTemplate,
                            createdAt: result.data.createdAt,
                            updatedAt: result.data.updatedAt,
                        };
                        onSelectPlay?.(fullPlay);
                    } else {
                        setError(`Failed to load play details: ${result.error}`);
                        setSelectedPlayId(null);
                    }
                } catch (err) {
                    console.error("Error fetching play details:", err);
                    setError("An error occurred while fetching play details.");
                    setSelectedPlayId(null);
                } finally {
                    setIsSelecting(false);
                }
            }
        },
        [store, mode, onSelectPlay, teamId]
    );

    /**
     * Handle edit button click - delegate to onEditPlay when provided,
     * otherwise navigate to the library edit page
     * Requirements: 4.5
     */
    const handleEditPlay = useCallback(
        (playId: string) => {
            if (onEditPlay) {
                onEditPlay(playId);
            } else {
                navigate(routes.libraryEdit(playId));
            }
        },
        [onEditPlay, navigate, routes]
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
            const result = await store.deletePlay({
                id: playToDelete,
                teamId,
            });

            if (result.success) {
                // A deleted starter copy can be added again: forget it was copied, then reload
                const deletedName = plays.find((play) => play.id === playToDelete)?.name;
                if (deletedName) {
                    setCopiedStarterNames((prev) => {
                        const next = new Set(prev);
                        next.delete(nameKey(deletedName));
                        return next;
                    });
                }
                await loadPlays(searchQuery, dateFilter, queryFilters, true);
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
    }, [store, playToDelete, plays, teamId, loadPlays, searchQuery, dateFilter, queryFilters]);

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
                {mode === "manage" && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate(routes.libraryNew())}
                    >
                        New Play
                    </Button>
                )}
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
                    onChange={handleSearchChange}
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
                        onChange={handleDateFilterChange}
                    >
                        <MenuItem value="all">All Time</MenuItem>
                        <MenuItem value="today">Today</MenuItem>
                        <MenuItem value="week">This Week</MenuItem>
                        <MenuItem value="month">This Month</MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Drill-tag filters (goaltender-aware drills) and the age filter (R3) */}
            <Stack spacing={1} sx={{ mb: 3 }}>
                <DrillFilterChips value={filters} onChange={handleFiltersChange} />
                <AgeFilter value={ageFilter} onChange={handleAgeChange} />
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
            {!isLoading && plays.length === 0 && (
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
                    {/* Say "no drills for this age" only when the age is the only narrowing and no starter card matches it either */}
                    {ageFilter && !searchQuery && dateFilter === "all" && !filters.focus && !filters.goalies && visibleStarters.length === 0 ? (
                        <AgeFilterEmpty noun="drills" ageGroup={ageFilter} onShowAll={() => handleAgeChange(null)} />
                    ) : (
                        <>
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                {searchQuery || dateFilter !== "all" || filtersActive
                                    ? "No plays found"
                                    : "No plays in your library yet"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                {searchQuery || dateFilter !== "all" || filtersActive
                                    ? "Try adjusting your search or filter settings"
                                    : "Create your first play to get started"}
                            </Typography>
                        </>
                    )}
                    {mode === "manage" && !searchQuery && dateFilter === "all" && !filtersActive && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => navigate(routes.libraryNew())}
                        >
                            Create Play
                        </Button>
                    )}
                </Box>
            )}

            {/* Play Grid */}
            {/* Requirements: 4.2 - Responsive grid for play thumbnails */}
            {!isLoading && plays.length > 0 && (
                <>
                    <Grid container spacing={3}>
                        {plays.map((play) => (
                            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={play.id}>
                                <PlayCard
                                    play={play}
                                    mode={mode}
                                    isSelected={selectedPlayId === play.id}
                                    isLoading={selectedPlayId === play.id && isSelecting}
                                    onSelect={handleSelectPlay}
                                    onEdit={handleEditPlay}
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

            {/* Starter Plays */}
            {/* Curated pack of common drills/plays that can be copied into the library */}
            {mode === "manage" && !isLoading && visibleStarters.length > 0 && (
                <Box sx={{ mt: 5 }}>
                    <Divider sx={{ mb: 3 }} />
                    <Typography variant="h6" component="h3" gutterBottom>
                        Starter plays
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Curated drills and set plays to seed your library. Adding one
                        creates an editable copy for your team.
                    </Typography>
                    <Grid container spacing={3}>
                        {visibleStarters.map((starter) => (
                            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={starter.id}>
                                <StarterPlayCard
                                    starter={starter}
                                    thumbnail={starterThumbnails[starter.id]}
                                    isAdding={addingStarterId === starter.id}
                                    disabled={addingStarterId !== null}
                                    onAdd={handleAddStarter}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </Box>
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
                        action cannot be undone. Sessions that use this drill keep their own copy.
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
