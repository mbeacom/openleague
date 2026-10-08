"use client";

/**
 * "Suggested drills" (roster and suggestions spec R13, R14): library and
 * starter drills ranked for the practice roster's skaters, goalies and age,
 * with a reason per drill and a one-tap Add. Portable: reads the library
 * through the planner store, so both planners share it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { AddOutlined, LightbulbOutlined } from "@mui/icons-material";
import type { SavedPlay, SessionItem } from "@/types/practice-planner";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { usePlannerStore, type LibraryPlay, type LibraryPlaySummary } from "@/lib/planner-store";
import { isDrillRow } from "@/lib/utils/session-rows";
import { rosterCounts, type PracticeRoster } from "@/lib/utils/practice-roster";
import {
    mostStations,
    rankDrillSuggestions,
    suggestionCandidates,
    suggestionGoalies,
    type RankOptions,
    type SuggestionCandidate,
} from "@/lib/utils/drill-suggestions";
import { waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { STORED_THUMBNAIL_PIXEL_RATIO } from "@/lib/utils/thumbnail-rules";

export const SUGGESTIONS_HEADING = "Suggested drills";
export const SUGGESTIONS_EMPTY_ROSTER = "Add players to see drills that fit.";
export const SUGGESTIONS_NONE = "No drills fit this roster yet.";
export const SUGGESTION_ADD_FAILED = "Couldn't add that drill. Try again.";
/** The library drills considered: the store's page limit. */
const LIBRARY_LIMIT = 100;

function toSavedPlay(play: LibraryPlay): SavedPlay {
    return {
        id: play.id,
        name: play.name,
        description: play.description ?? "",
        thumbnail: play.thumbnail ?? "",
        playData: play.playData,
        focus: play.focus,
        goalies: play.goalies,
        ageGroups: play.ageGroups,
        isTemplate: play.isTemplate,
        createdAt: play.createdAt,
        updatedAt: play.updatedAt,
    };
}

function starterThumbnail(candidate: SuggestionCandidate): string | undefined {
    if (!candidate.playData) return undefined;
    try {
        return generateThumbnail(candidate.playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO });
    } catch (error) {
        console.error(`Error generating thumbnail for ${candidate.name}:`, error);
        return undefined;
    }
}

export interface DrillSuggestionsPanelProps {
    teamId: string;
    roster: PracticeRoster;
    goaliesAttending: number | null;
    plays: readonly SessionItem[];
    disabled: boolean;
    onAdd: (play: SavedPlay) => void;
    /** The favorites seam (R13): passed straight to the ranker. */
    compare?: RankOptions["compare"];
}

export function DrillSuggestionsPanel({ teamId, roster, goaliesAttending, plays, disabled, onAdd, compare }: DrillSuggestionsPanelProps) {
    const store = usePlannerStore();
    // The library as last loaded, tagged with what it was loaded for: loading is "not loaded for this yet".
    const [loaded, setLoaded] = useState<{ key: string; plays: LibraryPlaySummary[] } | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const ageGroup = roster.ageGroup;
    const counts = rosterCounts(roster);
    const hasPlayers = counts.total > 0;
    const loadKey = `${teamId}|${ageGroup ?? ""}|${reload}`;
    const loading = hasPlayers && loaded?.key !== loadKey;
    const library = loaded?.plays;

    useEffect(() => {
        if (!hasPlayers) return;
        let current = true;
        store
            .getPlaysByTeam({ teamId, isTemplate: true, page: 1, limit: LIBRARY_LIMIT, dateFilter: "all", ...(ageGroup && { ageGroup }) })
            .then((result) => {
                if (current) setLoaded({ key: loadKey, plays: result.success ? result.data.plays : [] });
            })
            .catch((err: unknown) => {
                console.error("Error loading drills for suggestions:", err);
                if (current) setLoaded({ key: loadKey, plays: [] });
            });
        return () => {
            current = false;
        };
    }, [store, teamId, ageGroup, hasPlayers, loadKey]);

    const suggestions = useMemo(() => {
        if (!hasPlayers) return [];
        const candidates = suggestionCandidates(library ?? [], STARTER_PLAYS);
        const names = plays.filter(isDrillRow).map((play) => play.name);
        return rankDrillSuggestions(
            candidates,
            { skaters: counts.skaters, goalies: suggestionGoalies(roster, goaliesAttending), ageGroup, stations: mostStations(plays), excludeNames: names },
            { compare },
        );
    }, [hasPlayers, library, plays, counts.skaters, roster, goaliesAttending, ageGroup, compare]);

    const add = useCallback(
        async (candidate: SuggestionCandidate) => {
            setAdding(candidate.id);
            setError(null);
            try {
                let id = candidate.id;
                if (candidate.source === "starter") {
                    // Hosted sessions reference library drills: copy the starter in first, as "Add to my library" does.
                    const starter = STARTER_PLAYS.find((play) => play.id === candidate.id);
                    if (!starter) throw new Error(`Unknown starter ${candidate.id}`);
                    await waitForDiagramFont();
                    const created = await store.createPlay({
                        name: starter.name,
                        description: starter.description,
                        thumbnail: starterThumbnail(candidate),
                        playData: starter.playData,
                        focus: starter.focus,
                        goalies: starter.goalies,
                        ageGroups: [...starter.ageGroups],
                        isTemplate: true,
                        teamId,
                    });
                    if (!created.success) throw new Error(created.error);
                    id = created.data.id;
                    setReload((count) => count + 1);
                }
                const result = await store.getPlayById({ id, teamId });
                if (!result.success) throw new Error(result.error);
                onAdd(toSavedPlay(result.data));
            } catch (err) {
                console.error("Error adding a suggested drill:", err);
                setError(SUGGESTION_ADD_FAILED);
            } finally {
                setAdding(null);
            }
        },
        [store, teamId, onAdd],
    );

    return (
        <Paper elevation={1} sx={{ p: 2, borderLeft: 4, borderColor: "secondary.main" }} component="section" aria-label={SUGGESTIONS_HEADING}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <LightbulbOutlined sx={{ color: "secondary.main" }} aria-hidden />
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 800 }}>
                    {SUGGESTIONS_HEADING}
                </Typography>
                {loading && <CircularProgress size={16} aria-label="Loading drills" />}
            </Stack>
            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
                    {error}
                </Alert>
            )}
            {!hasPlayers ? (
                <Typography variant="body2" color="text.secondary">
                    {SUGGESTIONS_EMPTY_ROSTER}
                </Typography>
            ) : suggestions.length === 0 && !loading ? (
                <Typography variant="body2" color="text.secondary">
                    {SUGGESTIONS_NONE}
                </Typography>
            ) : (
                <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }} aria-label="Suggestions">
                    {suggestions.map(({ candidate, reasons }) => (
                        <Stack
                            key={`${candidate.source}-${candidate.id}`}
                            component="li"
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}
                        >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 700 }}>{candidate.name}</Typography>
                                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                                    {reasons.map((reason) => (
                                        <Chip key={reason} label={reason} size="small" variant="outlined" />
                                    ))}
                                    {candidate.source === "starter" && <Chip label="Starter drill" size="small" color="secondary" variant="outlined" />}
                                </Stack>
                            </Box>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddOutlined />}
                                onClick={() => void add(candidate)}
                                // Off until the library is loaded for this key: an unloaded library reads every starter as absent (a duplicate copy).
                                disabled={disabled || adding !== null || loading}
                                aria-label={`Add ${candidate.name}`}
                                sx={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
                            >
                                Add
                            </Button>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
