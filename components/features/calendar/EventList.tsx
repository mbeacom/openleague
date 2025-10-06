import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import EventCard from "./EventCard";

interface Event {
  id: string;
  type: "GAME" | "PRACTICE";
  title: string;
  startAt: string; // ISO string from server component
  location: string;
  opponent: string | null;
}

interface EventListProps {
  events: Event[];
  emptyMessage?: string;
}

export default function EventList({
  events,
  emptyMessage = "No events scheduled",
}: EventListProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md")); // 960px+

  if (events.length === 0) {
    return (
      <Box
        sx={{
          py: 8,
          textAlign: "center",
        }}
      >
        <Typography variant="h6" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: isDesktop ? "grid" : "flex",
        flexDirection: isDesktop ? undefined : "column",
        gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(300px, 1fr))" : undefined,
        gap: 2,
      }}
    >
      {events.map((event) => (
        <EventCard
          key={event.id}
          id={event.id}
          type={event.type}
          title={event.title}
          startAt={event.startAt}
          location={event.location}
          opponent={event.opponent}
        />
      ))}
    </Box>
  );
}
