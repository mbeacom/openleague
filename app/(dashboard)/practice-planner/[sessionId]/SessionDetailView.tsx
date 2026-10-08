"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  LinkOff as UnshareIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  AccessTime as ClockIcon,
  SportsHockey as HockeyIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  PlayArrow as PlayIcon,
  Place as PlaceIcon,
  PrintOutlined as PrintIcon,
} from "@mui/icons-material";
import { EmptyState } from "@/components/ui/EmptyState";
import { Crest } from "@/components/ui/Crest";
import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";
import { PlayLegend } from "@/components/features/practice-planner/PlayLegend";
import { SessionEquipmentCard } from "@/components/features/practice-planner/SessionEquipmentCard";
import { StationMap } from "@/components/features/practice-planner/StationMap";
import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";
import { ExportPlanMenu } from "@/components/features/practice-planner/ExportPlanMenu";
import { RosterSummary } from "@/components/features/practice-planner/RosterSummary";
import { PlayDiagram } from "@/components/features/practice-planner/PlayDiagram";
import { useSessionGoalies } from "@/components/features/practice-planner/useSessionGoalies";
import { SidebarPlayCard } from "@/components/features/practice-planner/SidebarPlayCard";
import type { PracticeSessionView } from "@/types/practice-planner";
import {
  SEGMENT_KIND_FIT_LABELS,
  groupStations,
  rotationBlockLabel,
  sessionWallMinutes,
  stationBlockLabel,
  stationTimingLabel,
  stationWarnings,
} from "@/lib/utils/session-timeline";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { drillRows } from "@/lib/utils/session-rows";
import { runByLabel, staffNames } from "@/lib/utils/session-staff";
import { useClockText } from "@/lib/hooks/useClockText";
import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";

interface SessionDetailViewProps {
  session: PracticeSessionView;
  isAdmin: boolean;
}

export function SessionDetailView({ session, isAdmin }: SessionDetailViewProps) {
  const store = usePlannerStore();
  const { Link, Image, navigate, routes } = usePlannerPlatform();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [activePlayIndex, setActivePlayIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(session.isShared);
  // The play sequence, the viewer and the counts are drills; blocks show on the timeline only (spec R9).
  const drills = useMemo(() => drillRows(session.plays), [session.plays]);
  const gap = session.transitionMinutes ?? 0;

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    const result = await store.deletePracticeSession({
      id: session.id,
      teamId: session.teamId,
    });

    if (result.success) {
      navigate(routes.list());
    } else {
      setError(result.error);
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [session.id, session.teamId, store, navigate, routes]);

  const handleShare = useCallback(async () => {
    // Team sharing is hosted-only; the button is hidden when the store lacks it.
    if (!store.sharePracticeSession) return;
    setIsSharing(true);
    setError(null);
    setShowShareDialog(false);

    const result = await store.sharePracticeSession({
      id: session.id,
      teamId: session.teamId,
      isShared: !isShared,
    });

    if (result.success) {
      setIsShared(result.data.isShared);
    } else {
      setError(result.error);
    }
    setIsSharing(false);
  }, [session.id, session.teamId, isShared, store]);

  const handlePrevPlay = useCallback(() => {
    setActivePlayIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextPlay = useCallback(() => {
    setActivePlayIndex((prev) => Math.min(drills.length - 1, prev + 1));
  }, [drills.length]);

  // Station blocks run at the same time, so time allocation is wall time (2b).
  const totalPlayTime = sessionWallMinutes(session.plays, gap);
  // A zero-minute session (bad stored data) reads as full, not NaN%.
  const durationPercent =
    session.duration > 0 ? Math.min((totalPlayTime / session.duration) * 100, 100) : 100;
  // Booked: startAt in the venue's zone, with its short name; else date in the viewer's zone (3b).
  const start = sessionStart(session);
  const { timeZone, showZone } = sessionTimeZone(session);
  const clock = useClockText(timeZone, showZone);
  const activePlay = drills[activePlayIndex] ?? null;
  const { shown, messages: goalieMessages } = useSessionGoalies(session);
  // The diagram as drawn for this session (spec R7); the stored play is never changed.
  // The display copy keeps the row order, so its drills line up with `drills`.
  const shownDrills = useMemo(() => drillRows(shown.plays), [shown]);
  const drawnAt = (index: number) => shownDrills[index]?.play.playData ?? drills[index]?.play.playData ?? null;
  const activeDrawn = activePlay ? drawnAt(activePlayIndex) : null;
  const groups = useMemo(() => groupStations(drills), [drills]);
  const activeGroup = activePlay
    ? groups.find((group) => group.stations.includes(activePlay)) ?? null
    : null;
  const stationMapStations = useMemo(
    () =>
      activeGroup && activeGroup.stations.length > 1
        ? activeGroup.stations.map((sp) => ({
            name: sp.play.name,
            playData: shownDrills[drills.indexOf(sp)]?.play.playData ?? sp.play.playData,
          }))
        : null,
    [activeGroup, shownDrills, drills]
  );
  // Advisory fit check against the booked segment's kind (2b); unreadable drills are skipped.
  const fitLabel = session.segmentKind ? SEGMENT_KIND_FIT_LABELS[session.segmentKind] : null;
  const tooBigCount = useMemo(
    () =>
      stationWarnings(
        groupStations(
          drills.map((sp) => ({ ...sp, area: sp.play.playData ? sp.play.playData.area : null }))
        ),
        session.segmentKind ?? null
      ).tooBig.length,
    [drills, session.segmentKind]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Back navigation */}
      <Button
        component={Link}
        href={routes.list()}
        startIcon={<ArrowBackIcon />}
        variant="text"
        sx={{ alignSelf: "flex-start", ml: -1 }}
      >
        Practice Planner
      </Button>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Session Header */}
      <Paper
        sx={{
          p: 3,
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background:
              "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)",
          },
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              {session.teamMark && (
                <Crest
                  name={session.teamMark.name}
                  id={session.teamMark.id}
                  logoUrl={session.teamMark.logoUrl}
                  brandColor={session.teamMark.color}
                  size="md"
                  sx={{ alignSelf: "flex-start" }}
                />
              )}
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>
                {session.title}
              </Typography>
              {isShared && (
                <Chip
                  label="Shared"
                  color="primary"
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Stack>

            {/* Metadata row */}
            <Stack
              direction="row"
              spacing={2.5}
              flexWrap="wrap"
              useFlexGap
              sx={{ color: "text.secondary" }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <CalendarIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2">
                  {clock.longDate(start)} at {clock.time(start)}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <ClockIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2">
                  {session.duration} min session
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <HockeyIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2">
                  {drills.length} play{drills.length !== 1 ? "s" : ""}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PersonIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2">{session.createdByName}</Typography>
              </Stack>
              {/* Ice booking (feature 006, FR-019): venue · surface · segment · time */}
              {session.venueName && (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <PlaceIcon sx={{ fontSize: 16 }} />
                  <Typography variant="body2">
                    {[session.venueName, session.surfaceName, session.segmentName]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                  {fitLabel && tooBigCount > 0 && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`${tooBigCount} drill${tooBigCount === 1 ? "" : "s"} larger than the booked ${fitLabel}`}
                    />
                  )}
                </Stack>
              )}
              {session.goaliesAttending != null && (
                <Chip size="small" variant="outlined" label={`Goalies: ${session.goaliesAttending}`} />
              )}
              {goalieMessages.map((message) => (
                <Chip
                  key={message}
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={message}
                  sx={{ height: "auto", maxWidth: "100%", "& .MuiChip-label": { whiteSpace: "normal", py: 0.25 } }}
                />
              ))}
            </Stack>
          </Box>

          {/* Actions: the bench sheet for everyone who can see the session (3b); the rest for admins */}
          <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
            <Button
              component="a"
              href={routes.sessionPrint(session.id)}
              target="_blank"
              rel="noopener"
              variant="outlined"
              startIcon={<PrintIcon />}
              size={isMobile ? "small" : "medium"}
            >
              Print bench sheet
            </Button>
            <ExportPlanMenu session={session} size={isMobile ? "small" : "medium"} />
            {isAdmin && (
              <>
                {store.sharePracticeSession && (
                  <Tooltip title={isShared ? "Unshare from team" : "Share with team"}>
                    <Button
                      variant="outlined"
                      startIcon={isShared ? <UnshareIcon /> : <ShareIcon />}
                      onClick={() => setShowShareDialog(true)}
                      disabled={isSharing}
                      size={isMobile ? "small" : "medium"}
                    >
                      {isSharing ? "..." : isShared ? "Unshare" : "Share"}
                    </Button>
                  </Tooltip>
                )}
                <Button
                  component={Link}
                  href={routes.sessionEdit(session.id)}
                  variant="contained"
                  startIcon={<EditIcon />}
                  size={isMobile ? "small" : "medium"}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DuplicateIcon />}
                  onClick={() => setShowDuplicateDialog(true)}
                  size={isMobile ? "small" : "medium"}
                >
                  Duplicate
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                  size={isMobile ? "small" : "medium"}
                >
                  Delete
                </Button>
              </>
            )}
          </Stack>
        </Stack>

        {/* Duration progress bar */}
        <Box sx={{ mt: 2.5 }}>
          {/* The numbers are in the timeline's "Planned X of Y min" footer (3b) */}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
            Time allocation
          </Typography>
          <LinearProgress
            variant="determinate"
            aria-label="Time allocation"
            value={durationPercent}
            color={totalPlayTime > session.duration ? "error" : "primary"}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: "action.hover",
            }}
          />
        </Box>
      </Paper>

      <RosterSummary roster={session.roster} />

      {/* Timeline (3b): when each block runs */}
      {session.plays.length > 0 && (
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 1 }}
          >
            Timeline
          </Typography>
          <SessionTimeline
            plays={session.plays}
            sessionStart={start}
            timeZone={timeZone}
            showZone={showZone}
            durationMinutes={session.duration}
            transitionMinutes={gap}
            staff={session.staff}
            activePlayId={activePlay?.id}
            onSelectPlay={(id) => setActivePlayIndex(Math.max(0, drills.findIndex((sp) => sp.id === id)))}
          />
        </Paper>
      )}

      {/* Practice equipment: the drills' lists rolled up, plus the practice's own items */}
      <SessionEquipmentCard plays={session.plays} equipment={session.equipment} />

      {/* Content area */}
      {drills.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<HockeyIcon />}
            title="No plays in this session"
            description={
              isAdmin
                ? "Edit the session to add plays from the library."
                : "The coach hasn't added any plays yet."
            }
            action={
              isAdmin ? (
                <Button
                  component={Link}
                  href={routes.sessionEdit(session.id)}
                  variant="contained"
                  startIcon={<EditIcon />}
                >
                  Edit Session
                </Button>
              ) : undefined
            }
          />
        </Paper>
      ) : (
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
          {/* Play list sidebar */}
          <Box
            sx={{
              width: { xs: "100%", md: 280 },
              flexShrink: 0,
              order: { xs: 2, md: 1 },
            }}
          >
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1.5, textTransform: "uppercase", letterSpacing: 1 }}
            >
              Play Sequence
            </Typography>
            <Stack spacing={1}>
              {groups.map((group) => {
                const cards = group.stations.map((sp) => {
                  const index = drills.indexOf(sp);
                  return (
                    <SidebarPlayCard
                      key={sp.id}
                      sp={sp}
                      drawn={drawnAt(index)}
                      timing={stationTimingLabel(sp, group.rotation)}
                      index={index}
                      active={index === activePlayIndex}
                      onSelect={() => setActivePlayIndex(index)}
                      runBy={runByLabel(staffNames(sp.staff, session.staff))}
                    />
                  );
                });
                if (group.stations.length === 1) return cards[0];
                const label = group.rotation
                  ? rotationBlockLabel(group.rotation.minutes, group.wallMinutes)
                  : stationBlockLabel(group.stations.length, group.wallMinutes);
                return (
                  <Box
                    key={`stations-${group.stations[0].id}`}
                    role="group"
                    aria-label={label}
                    sx={{ border: 2, borderColor: "primary.main", borderRadius: 1, p: 1 }}
                  >
                    <Typography
                      variant="caption"
                      component="p"
                      sx={{
                        mb: 1,
                        fontWeight: 800,
                        color: "primary.main",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {label}
                    </Typography>
                    <Stack spacing={1}>{cards}</Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {/* Main play viewer */}
          <Box sx={{ flex: 1, order: { xs: 1, md: 2 } }}>
            {activePlay && (
              <Paper sx={{ overflow: "hidden" }}>
                {/* Play navigation header */}
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 3,
                    py: 1.5,
                    bgcolor: "action.hover",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <PlayIcon sx={{ fontSize: 18, color: "primary.main" }} />
                    <Typography variant="subtitle2">
                      Play {activePlayIndex + 1} of {drills.length}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton
                      onClick={handlePrevPlay}
                      disabled={activePlayIndex === 0}
                      size="small"
                      aria-label="Previous play"
                    >
                      <PrevIcon />
                    </IconButton>
                    <IconButton
                      onClick={handleNextPlay}
                      disabled={activePlayIndex === drills.length - 1}
                      size="small"
                      aria-label="Next play"
                    >
                      <NextIcon />
                    </IconButton>
                  </Stack>
                </Stack>

                {/* Station map (2b): the active drill's whole block, this station highlighted */}
                {stationMapStations && activeGroup && (
                  <Box sx={{ px: 3, pt: 2 }}>
                    <StationMap
                      stations={stationMapStations}
                      activeIndex={activeGroup.stations.indexOf(activePlay)}
                    />
                  </Box>
                )}

                {/* Thumbnail / rink preview */}
                <Box
                  sx={{
                    width: "100%",
                    height: { xs: 220, sm: 300, md: 360 },
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {/* Drawn live at the screen's pixel ratio; the drawn data already drops a hidden goalie. */}
                  {activeDrawn ? (
                    // Fit inside the fixed-height preview, keeping the thumbnail's shape.
                    <PlayDiagram playData={activeDrawn} label={activePlay.play.name} sx={{ height: "100%", width: "auto" }} />
                  ) : activePlay.play.thumbnail ? (
                    <Image src={activePlay.play.thumbnail} alt={activePlay.play.name} fit="contain" />
                  ) : (
                    <Stack alignItems="center" spacing={1}>
                      <HockeyIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.secondary">
                        No preview available
                      </Typography>
                    </Stack>
                  )}
                </Box>

                <Box sx={{ px: 3, pt: 2 }}>
                  <PlayLegend playData={activeDrawn} />
                </Box>

                {/* Play details */}
                <Box sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {activePlay.play.name}
                    </Typography>
                    <Chip
                      icon={<ClockIcon />}
                      label={`${activePlay.duration} min`}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </Stack>

                  {activePlay.play.description && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontWeight: 600,
                        }}
                      >
                        Description
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 0.5 }}>
                        {activePlay.play.description}
                      </Typography>
                    </Box>
                  )}

                  {activePlay.instructions && (
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontWeight: 600,
                          opacity: 0.8,
                        }}
                      >
                        Coach&apos;s Instructions
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 0.5 }}>
                        {activePlay.instructions}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            )}
          </Box>
        </Stack>
      )}

      {isAdmin && showDuplicateDialog && (
        <DuplicateSessionDialog
          open
          sessionId={session.id}
          teamId={session.teamId}
          sourceDate={session.date}
          onClose={() => setShowDuplicateDialog(false)}
        />
      )}

      {/* Delete dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">
          Delete Practice Session?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{session.title}&quot;? This
            action cannot be undone and all plays in this session will be
            removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={
              isDeleting ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share dialog */}
      <Dialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        aria-labelledby="share-dialog-title"
      >
        <DialogTitle id="share-dialog-title">
          {isShared ? "Unshare" : "Share"} Practice Session?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {isShared
              ? "This will hide the practice session from team members. They will no longer be able to view it."
              : `This will share "${session.title}" with all members of ${session.teamName}. They will be notified by email.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowShareDialog(false)} disabled={isSharing}>
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            color="primary"
            variant="contained"
            disabled={isSharing}
            startIcon={
              isSharing ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {isSharing ? "..." : isShared ? "Unshare" : "Share"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
