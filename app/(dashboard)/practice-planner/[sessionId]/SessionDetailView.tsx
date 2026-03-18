"use client";

import { useState, useCallback } from "react";
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
  CardMedia,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  IconButton,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
} from "@mui/icons-material";
import {
  deletePracticeSession,
  sharePracticeSession,
} from "@/lib/actions/practice-sessions";

interface SessionPlay {
  id: string;
  sequence: number;
  duration: number;
  instructions: string | null;
  play: {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
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
  plays: SessionPlay[];
}

interface SessionDetailViewProps {
  session: SessionData;
  isAdmin: boolean;
}

export function SessionDetailView({ session, isAdmin }: SessionDetailViewProps) {
  const router = useRouter();
  const [activePlayIndex, setActivePlayIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
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

  const totalPlayTime = session.plays.reduce((sum, p) => sum + p.duration, 0);
  const sessionDate = new Date(session.date);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header with back navigation */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Button
          component={Link}
          href="/practice-planner"
          startIcon={<ArrowBackIcon />}
          variant="text"
        >
          Back
        </Button>
      </Stack>

      {/* Error display */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Session metadata */}
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
        >
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              {session.title}
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                {sessionDate.toLocaleDateString()} at{" "}
                {sessionDate.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {session.duration} min session
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {session.plays.length} plays ({totalPlayTime} min total)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Created by {session.createdByName}
              </Typography>
            </Stack>
            {isShared && (
              <Chip
                label="Shared with team"
                color="primary"
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </Box>

          {/* Admin actions */}
          {isAdmin && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<ShareIcon />}
                onClick={() => setShowShareDialog(true)}
                disabled={isSharing}
              >
                {isSharing ? "..." : isShared ? "Unshare" : "Share"}
              </Button>
              <Button
                component={Link}
                href={`/practice-planner/${session.id}/edit`}
                variant="contained"
                startIcon={<EditIcon />}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeleting}
              >
                Delete
              </Button>
            </Stack>
          )}
        </Stack>

        {/* Duration warning */}
        {totalPlayTime > session.duration && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Total play time ({totalPlayTime} min) exceeds session duration (
            {session.duration} min)
          </Alert>
        )}
      </Paper>

      {/* Play list */}
      {session.plays.length === 0 ? (
        <Paper elevation={2} sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No plays in this session
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isAdmin
              ? "Edit the session to add plays from the library."
              : "The coach hasn't added any plays yet."}
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Active play viewer with navigation */}
          <Paper elevation={2} sx={{ p: 3 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6" component="h2">
                Play {activePlayIndex + 1} of {session.plays.length}
              </Typography>
              <Stack direction="row" spacing={1}>
                <IconButton
                  onClick={handlePrevPlay}
                  disabled={activePlayIndex === 0}
                  aria-label="Previous play"
                >
                  <PrevIcon />
                </IconButton>
                <IconButton
                  onClick={handleNextPlay}
                  disabled={activePlayIndex === session.plays.length - 1}
                  aria-label="Next play"
                >
                  <NextIcon />
                </IconButton>
              </Stack>
            </Stack>

            {(() => {
              const activePlay = session.plays[activePlayIndex];
              return (
                <Box>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={3}
                  >
                    {/* Play thumbnail */}
                    <Box
                      sx={{
                        width: { xs: "100%", md: 400 },
                        height: { xs: 200, md: 280 },
                        bgcolor: "grey.100",
                        borderRadius: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      {activePlay.play.thumbnail ? (
                        <Image
                          src={activePlay.play.thumbnail}
                          alt={activePlay.play.name}
                          fill
                          style={{ objectFit: "contain", borderRadius: 8 }}
                          unoptimized
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          No preview available
                        </Typography>
                      )}
                    </Box>

                    {/* Play details */}
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h5" gutterBottom>
                        {activePlay.play.name}
                      </Typography>
                      <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                          Duration: {activePlay.duration} minutes
                        </Typography>
                        {activePlay.play.description && (
                          <Box>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              gutterBottom
                            >
                              Description:
                            </Typography>
                            <Typography variant="body1">
                              {activePlay.play.description}
                            </Typography>
                          </Box>
                        )}
                        {activePlay.instructions && (
                          <Box>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              gutterBottom
                            >
                              Session Instructions:
                            </Typography>
                            <Typography variant="body1">
                              {activePlay.instructions}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  </Stack>
                </Box>
              );
            })()}
          </Paper>

          {/* All plays list */}
          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              All Plays
            </Typography>
            <Stack spacing={2}>
              {session.plays.map((sp, index) => (
                <Card
                  key={sp.id}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    cursor: "pointer",
                    border: index === activePlayIndex ? 2 : 1,
                    borderColor:
                      index === activePlayIndex
                        ? "primary.main"
                        : "divider",
                    transition: "border-color 0.2s",
                    "&:hover": {
                      borderColor: "primary.light",
                    },
                  }}
                  onClick={() => setActivePlayIndex(index)}
                >
                  <CardMedia
                    component="div"
                    sx={{
                      width: { xs: "100%", sm: 120 },
                      height: { xs: 80, sm: 80 },
                      bgcolor: "grey.100",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {sp.play.thumbnail ? (
                      <Image
                        src={sp.play.thumbnail}
                        alt={sp.play.name}
                        fill
                        style={{ objectFit: "contain" }}
                        unoptimized
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        #{index + 1}
                      </Typography>
                    )}
                  </CardMedia>
                  <CardContent sx={{ py: 1, flexGrow: 1 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box>
                        <Typography variant="subtitle2">
                          {index + 1}. {sp.play.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {sp.duration} min
                          {sp.instructions
                            ? ` • ${sp.instructions.slice(0, 60)}${sp.instructions.length > 60 ? "..." : ""}`
                            : ""}
                        </Typography>
                      </Box>
                      {index === activePlayIndex && (
                        <Chip label="Viewing" color="primary" size="small" />
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Paper>
        </>
      )}

      {/* Delete confirmation dialog */}
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
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowDeleteDialog(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share/Unshare confirmation dialog */}
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
              : "This will share the practice session with all team members. They will receive an email notification."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowShareDialog(false)}
            disabled={isSharing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            color="primary"
            variant="contained"
            disabled={isSharing}
            startIcon={
              isSharing ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isSharing ? "..." : isShared ? "Unshare" : "Share"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
