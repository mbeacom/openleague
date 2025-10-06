"use client";

import { Card, CardContent, Typography, Box, Chip } from "@mui/material";
import { useRouter } from "next/navigation";

interface EventCardProps {
  id: string;
  type: "GAME" | "PRACTICE";
  title: string;
  startAt: string; // ISO string from server component
  location: string;
  opponent: string | null;
}

export default function EventCard({
  id,
  type,
  title,
  startAt,
  location,
  opponent,
}: EventCardProps) {
  const router = useRouter();

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

  const handleClick = () => {
    router.push(`/events/${id}`);
  };

  return (
    <Card
      onClick={handleClick}
      sx={{
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
          {title}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            📅 {dateStr} at {timeStr}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            📍 {location}
          </Typography>

          {opponent && (
            <Typography variant="body2" color="text.secondary">
              🏆 vs {opponent}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
