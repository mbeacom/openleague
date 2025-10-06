"use client";

import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";

interface AttendanceViewProps {
  rsvps: Array<{
    id: string;
    status: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
}

export default function AttendanceView({ rsvps }: AttendanceViewProps) {
  const groupedRSVPs = {
    GOING: rsvps.filter((r) => r.status === "GOING"),
    NOT_GOING: rsvps.filter((r) => r.status === "NOT_GOING"),
    MAYBE: rsvps.filter((r) => r.status === "MAYBE"),
    NO_RESPONSE: rsvps.filter((r) => r.status === "NO_RESPONSE"),
  };

  const StatusSection = ({
    title,
    count,
    color,
    items,
  }: {
    title: string;
    count: number;
    color: "success" | "error" | "warning" | "default";
    items: typeof rsvps;
  }) => (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          {title}
        </Typography>
        <Chip label={count} size="small" color={color} />
      </Box>
      {items.length > 0 ? (
        <List dense>
          {items.map((rsvp) => (
            <ListItem key={rsvp.id} sx={{ pl: 2 }}>
              <ListItemText
                primary={rsvp.user.name || rsvp.user.email}
                secondary={!rsvp.user.name ? rsvp.user.email : undefined}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
          None
        </Typography>
      )}
    </Box>
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Attendance Summary
        </Typography>

        <StatusSection
          title="Going"
          count={groupedRSVPs.GOING.length}
          color="success"
          items={groupedRSVPs.GOING}
        />

        <StatusSection
          title="Not Going"
          count={groupedRSVPs.NOT_GOING.length}
          color="error"
          items={groupedRSVPs.NOT_GOING}
        />

        <StatusSection
          title="Maybe"
          count={groupedRSVPs.MAYBE.length}
          color="warning"
          items={groupedRSVPs.MAYBE}
        />

        <StatusSection
          title="No Response"
          count={groupedRSVPs.NO_RESPONSE.length}
          color="default"
          items={groupedRSVPs.NO_RESPONSE}
        />
      </CardContent>
    </Card>
  );
}
