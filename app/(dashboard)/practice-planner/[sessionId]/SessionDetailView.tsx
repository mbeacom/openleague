"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  Card,
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
import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";
import { PlayLegend } from "@/components/features/practice-planner/PlayLegend";
import { StationMap } from "@/components/features/practice-planner/StationMap";
import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";
import type { PlayData } from "@/types/practice-planner";
import type { SegmentKind } from "@prisma/client";
import {
  SEGMENT_KIND_FIT_LABELS,
  groupStations,
  sessionWallMinutes,
  stationBlockLabel,
  stationWarnings,
} from "@/lib/utils/session-timeline";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
import {
  deletePracticeSession,
  sharePracticeSession,
} from "@/lib/actions/practice-sessions";

interface SessionPlay {
  id: string;
  sequence: number;
  duration: number;
  instructions: string | null;
  runsWithPrevious: boolean;
  play: {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: PlayData | null;
  };
}

interface SessionData {
  id: string;
  title: string;
  date: string;
  duration: number;
  isShared: boolean;
  createdByName: string;
  teamId: string;
  teamName: string;
  // Optional venue attachment (feature 006, FR-019)
  venueId?: string | null;
  venueName?: string | null;
  venueTimezone?: string | null;
  surfaceId?: string | null;
  surfaceName?: string | null;
  segmentId?: string | null;
  segmentName?: string | null;
  segmentKind?: SegmentKind | null;
  startAt?: string | null;
  plays: SessionPlay[];
}

interface SessionDetailViewProps {
  session: SessionData;
  isAdmin: boolean;
}

export function SessionDetailView({ session, isAdmin }: SessionDetailViewProps) {
  const router = useRouter();
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

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    const result = await deletePracticeSession({
      id: session.id,
      teamId: session.teamId,
    });

    if (result.success) {
      router.push("/practice-planner");
    } else {
      setError(result.error);
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [session.id, session.teamId, router]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setError(null);
    setShowShareDialog(false);

    const result = await sharePracticeSession({
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
  }, [session.id, session.teamId, isShared]);

  const handlePrevPlay = useCallback(() => {
    setActivePlayIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextPlay = useCallback(() => {
    setActivePlayIndex((prev) => Math.min(session.plays.length - 1, prev + 1));
  }, [session.plays.length]);

  // Station blocks run at the same time, so time allocation is wall time (2b).
  const totalPlayTime = sessionWallMinutes(session.plays);
  // A zero-minute session (bad stored data) reads as full, not NaN%.
  const durationPercent =
    session.duration > 0 ? Math.min((totalPlayTime / session.duration) * 100, 100) : 100;
  // Booked: startAt in the venue's zone, with its short name; else date in the viewer's zone (3b).
  const start = sessionStart(session);
  const { timeZone, showZone } = sessionTimeZone(session);
  const clock = useClockText(timeZone, showZone);
  const activePlay = session.plays[activePlayIndex] ?? null;
  const groups = useMemo(() => groupStations(session.plays), [session.plays]);
  const activeGroup = activePlay
    ? groups.find((group) => group.stations.includes(activePlay)) ?? null
    : null;
  const stationMapStations = useMemo(
    () =>
      activeGroup && activeGroup.stations.length > 1
        ? activeGroup.stations.map((sp) => ({ name: sp.play.name, playData: sp.play.playData }))
        : null,
    [activeGroup]
  );
  // Advisory fit check against the booked segment's kind (2b); unreadable drills are skipped.
  const fitLabel = session.segmentKind ? SEGMENT_KIND_FIT_LABELS[session.segmentKind] : null;
  const tooBigCount = useMemo(
    () =>
      stationWarnings(
        groupStations(
          session.plays.map((sp) => ({ ...sp, area: sp.play.playData ? sp.play.playData.area : null }))
        ),
        session.segmentKind ?? null
      ).tooBig.length,
    [session.plays, session.segmentKind]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Back navigation */}
      <Button
        component={Link}
        href="/practice-planner"
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
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
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
                  {session.plays.length} play{session.plays.length !== 1 ? "s" : ""}
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
            </Stack>
          </Box>

          {/* Actions: the bench sheet for everyone who can see the session (3b); the rest for admins */}
          <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
            <Button
              component="a"
              href={`/practice-planner/${session.id}/print`}
              target="_blank"
              rel="noopener"
              variant="outlined"
              startIcon={<PrintIcon />}
              size={isMobile ? "small" : "medium"}
            >
              Print bench sheet
            </Button>
            {isAdmin && (
              <>
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
                <Button
                  component={Link}
                  href={`/practice-planner/${session.id}/edit`}
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
              bgcolor: "grey.100",
            }}
          />
        </Box>
      </Paper>

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
            activePlayId={activePlay?.id}
            onSelectPlay={(id) =>
              setActivePlayIndex(Math.max(0, session.plays.findIndex((sp) => sp.id === id)))
            }
          />
        </Paper>
      )}

      {/* Content area */}
      {session.plays.length === 0 ? (
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
                  href={`/practice-planner/${session.id}/edit`}
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
                  const index = session.plays.indexOf(sp);
                  return (
                    <SidebarPlayCard
                      key={sp.id}
                      sp={sp}
                      index={index}
                      active={index === activePlayIndex}
                      onSelect={() => setActivePlayIndex(index)}
                    />
                  );
                });
                if (group.stations.length === 1) return cards[0];
                const label = stationBlockLabel(group.stations.length, group.wallMinutes);
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
                    bgcolor: "grey.50",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <PlayIcon sx={{ fontSize: 18, color: "primary.main" }} />
                    <Typography variant="subtitle2">
                      Play {activePlayIndex + 1} of {session.plays.length}
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
                      disabled={activePlayIndex === session.plays.length - 1}
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
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {activePlay.play.thumbnail ? (
                    <Image
                      src={activePlay.play.thumbnail}
                      alt={activePlay.play.name}
                      fill
                      style={{ objectFit: "contain" }}
                      unoptimized
                    />
                  ) : (
                    <Stack alignItems="center" spacing={1}>
                      <HockeyIcon sx={{ fontSize: 48, color: "grey.300" }} />
                      <Typography variant="body2" color="text.secondary">
                        No preview available
                      </Typography>
                    </Stack>
                  )}
                </Box>

                <Box sx={{ px: 3, pt: 2 }}>
                  <PlayLegend playData={activePlay.play.playData} />
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

interface SidebarPlayCardProps {
  sp: SessionPlay;
  index: number;
  active: boolean;
  onSelect: () => void;
}

/** One drill in the sidebar's play sequence; standalone or inside a station block (2b). */
function SidebarPlayCard({ sp, index, active, onSelect }: SidebarPlayCardProps) {
  return (
    <Card
      onClick={onSelect}
      sx={{
        cursor: "pointer",
        border: "2px solid",
        borderColor: active ? "primary.main" : "transparent",
        bgcolor: active ? "rgba(25, 118, 210, 0.04)" : "background.paper",
        boxShadow: active ? 2 : 0,
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: active ? "primary.main" : "primary.light",
          bgcolor: "rgba(25, 118, 210, 0.04)",
        },
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Play number */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: active ? "primary.main" : "grey.200",
              color: active ? "primary.contrastText" : "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>

          {/* Thumbnail */}
          <Box
            sx={{
              width: 48,
              height: 32,
              borderRadius: 1,
              bgcolor: "grey.100",
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {sp.play.thumbnail ? (
              <Image
                src={sp.play.thumbnail}
                alt=""
                fill
                style={{ objectFit: "cover" }}
                unoptimized
              />
            ) : (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HockeyIcon sx={{ fontSize: 14, color: "grey.400" }} />
              </Box>
            )}
          </Box>

          {/* Name & duration */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              noWrap
              sx={{ fontSize: "0.8rem" }}
            >
              {sp.play.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sp.duration} min
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
