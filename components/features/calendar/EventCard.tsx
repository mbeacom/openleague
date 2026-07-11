"use client";

import { Card, CardContent, Typography, Box, Chip } from "@mui/material";
import Link from "next/link";
import type { Event } from "@/types/events";

// EventCard can accept either simple Event or extended with league/team info
interface EventCardProps extends Event {
  leagueId?: string;
  homeTeam?: {
    id: string;
    name: string;
  } | null;
  awayTeam?: {
    id: string;
    name: string;
  } | null;
  teamName?: string;
}

export default function EventCard({
  id,
  type,
  title,
  startAt,
  location,
  opponent,
  homeTeam,
  awayTeam,
  teamName,
}: EventCardProps) {
  // Convert UTC date to local timezone
  const localDate = new Date(startAt);
  const dateStr = localDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = localDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  // Event type badge colors
  const badgeColor = type === "GAME" ? "primary" : "secondary";

  return (
    // Always use the team event detail route; repoint league events to
    // /league/[leagueId]/events/[id] when that route ships (roadmap D1)
    <Card
      component={Link}
      href={`/events/${id}`}
      sx={{
        display: "block",
        color: "inherit",
        textDecoration: "none",
        cursor: "pointer",
        minHeight: 44,
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          boxShadow: 3,
          transform: "translateY(-2px)",
        },
        "&:active": {
          transform: "translateY(0)",
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
          <Chip
            label={type}
            color={badgeColor}
            size="small"
            sx={{ fontWeight: 600 }}
          />
        </Box>

        <Typography variant="h6" component="h2" gutterBottom>
          {homeTeam && awayTeam ? `${homeTeam.name} vs ${awayTeam.name}` : title}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            📅 {dateStr} at {timeStr}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            📍 {location}
          </Typography>

          {homeTeam && awayTeam ? (
            <Typography variant="body2" color="text.secondary">
              👥 {homeTeam.name} (Home) vs {awayTeam.name} (Away)
            </Typography>
          ) : teamName ? (
            <Typography variant="body2" color="text.secondary">
              👥 {teamName}
            </Typography>
          ) : null}

          {opponent && !homeTeam && (
            <Typography variant="body2" color="text.secondary">
              🏆 vs {opponent}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
