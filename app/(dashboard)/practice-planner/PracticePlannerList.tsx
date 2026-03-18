"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  Paper,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Link from "next/link";
import Image from "next/image";
import AddIcon from "@mui/icons-material/Add";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import SearchIcon from "@mui/icons-material/Search";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SportsHockeyIcon from "@mui/icons-material/SportsHockey";
import ShareIcon from "@mui/icons-material/Share";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PersonIcon from "@mui/icons-material/Person";

interface SessionSummary {
  id: string;
  title: string;
  date: string;
  duration: number;
  isShared: boolean;
  createdByName: string;
  playCount: number;
  firstPlayThumbnail: string | null;
}

interface PracticePlannerListProps {
  sessions: SessionSummary[];
  isAdmin: boolean;
  teamName: string;
}

type TimeFilter = "all" | "upcoming" | "past";
type SortDirection = "asc" | "desc";

export default function PracticePlannerList({
  sessions,
  isAdmin,
  teamName,
}: PracticePlannerListProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const now = useMemo(() => new Date(), []);

  const filteredSessions = useMemo(() => {
    let filtered = sessions;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.createdByName.toLowerCase().includes(q)
      );
    }

    // Time filter
    if (timeFilter === "upcoming") {
      filtered = filtered.filter((s) => new Date(s.date) >= now);
    } else if (timeFilter === "past") {
      filtered = filtered.filter((s) => new Date(s.date) < now);
    }

    // Sort by date
    filtered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortDir === "asc" ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [sessions, search, timeFilter, sortDir, now]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const isUpcoming = (iso: string) => new Date(iso) >= now;

  return (
    <>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
            Practice Planner
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {teamName}
          </Typography>
        </Box>
        {isAdmin && (
          <Stack direction="row" spacing={1.5}>
            <Button
              component={Link}
              href="/practice-planner/library"
              variant="outlined"
              startIcon={<LibraryBooksIcon />}
              size={isMobile ? "small" : "medium"}
            >
              Play Library
            </Button>
            <Button
              component={Link}
              href="/practice-planner/new"
              variant="contained"
              startIcon={<AddIcon />}
              size={isMobile ? "small" : "medium"}
            >
              New Session
            </Button>
          </Stack>
        )}
      </Stack>

      {!isAdmin && (
        <Alert
          severity="info"
          icon={<ShareIcon fontSize="small" />}
          sx={{
            mb: 3,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "info.light",
          }}
        >
          Showing practice sessions shared by your coach.
        </Alert>
      )}

      {/* Filters Bar */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          alignItems: { xs: "stretch", md: "center" },
        }}
      >
        <TextField
          size="small"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 220, flex: { md: 1 } }}
        />

        <ToggleButtonGroup
          value={timeFilter}
          exclusive
          onChange={(_, val) => val && setTimeFilter(val as TimeFilter)}
          size="small"
          sx={{
            "& .MuiToggleButton-root": {
              textTransform: "none",
              fontWeight: 600,
              px: 2,
            },
          }}
        >
          <ToggleButton value="upcoming">Upcoming</ToggleButton>
          <ToggleButton value="past">Past</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={sortDir === "asc" ? "Oldest first" : "Newest first"}>
          <IconButton
            size="small"
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            {sortDir === "asc" ? (
              <ArrowUpwardIcon fontSize="small" />
            ) : (
              <ArrowDownwardIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Results count */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </Typography>

      {/* Session Grid */}
      {filteredSessions.length === 0 ? (
        <EmptyState
          isAdmin={isAdmin}
          hasSearch={!!search.trim()}
          timeFilter={timeFilter}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 3,
          }}
        >
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isUpcoming={isUpcoming(session.date)}
              formatDate={formatDate}
              formatTime={formatTime}
            />
          ))}
        </Box>
      )}
    </>
  );
}

function SessionCard({
  session,
  isUpcoming,
  formatDate,
  formatTime,
}: {
  session: SessionSummary;
  isUpcoming: boolean;
  formatDate: (iso: string) => string;
  formatTime: (iso: string) => string;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        opacity: isUpcoming ? 1 : 0.75,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: isUpcoming
            ? "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)"
            : "linear-gradient(90deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.06) 100%)",
        },
      }}
    >
      <CardActionArea
        component={Link}
        href={`/practice-planner/${session.id}`}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        {/* Thumbnail area */}
        <Box
          sx={{
            height: 120,
            bgcolor: "grey.100",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {session.firstPlayThumbnail ? (
            <Image
              src={session.firstPlayThumbnail}
              alt={`Preview of ${session.title}`}
              fill
              style={{ objectFit: "cover" }}
              unoptimized
            />
          ) : (
            <SportsHockeyIcon
              sx={{ fontSize: 48, color: "grey.300" }}
            />
          )}
        </Box>

        <CardContent sx={{ flex: 1, pt: 2 }}>
          {/* Title + shared badge */}
          <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: "1rem",
                lineHeight: 1.3,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {session.title}
            </Typography>
            {session.isShared && (
              <Chip
                label="Shared"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: "0.7rem", height: 22 }}
              />
            )}
          </Stack>

          {/* Date & time */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
            <CalendarTodayIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              {formatDate(session.date)} at {formatTime(session.date)}
            </Typography>
          </Stack>

          {/* Duration & play count */}
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <AccessTimeIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {session.duration} min
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <SportsHockeyIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {session.playCount} play{session.playCount !== 1 ? "s" : ""}
              </Typography>
            </Stack>
          </Stack>

          {/* Creator */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <PersonIcon sx={{ fontSize: 14, color: "text.disabled" }} />
            <Typography variant="caption" color="text.disabled">
              {session.createdByName}
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function EmptyState({
  isAdmin,
  hasSearch,
  timeFilter,
}: {
  isAdmin: boolean;
  hasSearch: boolean;
  timeFilter: TimeFilter;
}) {
  if (hasSearch) {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 8,
          px: 3,
        }}
      >
        <SearchIcon sx={{ fontSize: 56, color: "grey.300", mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No matching sessions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try a different search term or adjust your filters.
        </Typography>
      </Box>
    );
  }

  const messages = {
    upcoming: {
      admin: "No upcoming practice sessions scheduled.",
      member: "No upcoming shared sessions. Check back later.",
    },
    past: {
      admin: "No past practice sessions found.",
      member: "No past shared sessions found.",
    },
    all: {
      admin: "Create your first practice session to get started.",
      member: "Practice sessions will appear here once shared by your coach.",
    },
  };

  return (
    <Box
      sx={{
        textAlign: "center",
        py: 8,
        px: 3,
        bgcolor: "background.paper",
        borderRadius: 3,
        border: "2px dashed",
        borderColor: "divider",
      }}
    >
      <SportsHockeyIcon sx={{ fontSize: 56, color: "grey.300", mb: 2 }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        {timeFilter === "all"
          ? "No practice sessions yet"
          : `No ${timeFilter} sessions`}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {messages[timeFilter][isAdmin ? "admin" : "member"]}
      </Typography>
      {isAdmin && timeFilter !== "past" && (
        <Button
          component={Link}
          href="/practice-planner/new"
          variant="contained"
          startIcon={<AddIcon />}
        >
          Create Practice Session
        </Button>
      )}
    </Box>
  );
}
