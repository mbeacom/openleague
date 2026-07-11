"use client";

import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Divider,
  Grid,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import type {
  AttendanceCounts,
  AttendanceEntry,
  RSVPStatus,
} from "@/types/events";

interface AttendanceViewProps {
  /**
   * Per-identity attendance rows (contract of getEventAttendance): player-level
   * responses where they exist, user-level otherwise. A user row and their
   * child rows are distinct entries.
   */
  entries: AttendanceEntry[];
  /** Status counts, deduplicated per entry (not per user). */
  counts: AttendanceCounts;
}

const STATUS_SECTIONS: Array<{
  status: RSVPStatus;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    status: "GOING",
    label: "Going",
    icon: <CheckCircleIcon color="success" fontSize="small" />,
  },
  {
    status: "MAYBE",
    label: "Maybe",
    icon: <HelpIcon color="warning" fontSize="small" />,
  },
  {
    status: "NOT_GOING",
    label: "Not Going",
    icon: <CancelIcon color="error" fontSize="small" />,
  },
  {
    status: "NO_RESPONSE",
    label: "No Response",
    icon: <QuestionMarkIcon color="disabled" fontSize="small" />,
  },
];

function AttendanceEntryRow({ entry }: { entry: AttendanceEntry }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ minHeight: 32 }}
    >
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {entry.name}
      </Typography>
      <Chip
        label={entry.kind === "player" ? "Player" : "Member"}
        size="small"
        variant="outlined"
        color={entry.kind === "player" ? "primary" : "default"}
      />
      {entry.kind === "player" && entry.respondedByName && (
        <Typography variant="caption" color="text.secondary">
          answered by {entry.respondedByName}
        </Typography>
      )}
    </Stack>
  );
}

export function AttendanceView({ entries, counts }: AttendanceViewProps) {
  // Group entries by status for the detailed lists
  const grouped: Record<RSVPStatus, AttendanceEntry[]> = {
    GOING: [],
    NOT_GOING: [],
    MAYBE: [],
    NO_RESPONSE: [],
  };
  for (const entry of entries) {
    grouped[entry.status].push(entry);
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Attendance Summary
        </Typography>

        {/* Summary Counts */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "success.light",
                borderRadius: 1,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 32, color: "success.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.GOING}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Going
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "warning.light",
                borderRadius: 1,
              }}
            >
              <HelpIcon sx={{ fontSize: 32, color: "warning.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.MAYBE}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Maybe
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "error.light",
                borderRadius: 1,
              }}
            >
              <CancelIcon sx={{ fontSize: 32, color: "error.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.NOT_GOING}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Not Going
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "grey.200",
                borderRadius: 1,
              }}
            >
              <QuestionMarkIcon sx={{ fontSize: 32, color: "grey.600" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.NO_RESPONSE}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No Response
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Detailed Lists */}
        <Stack spacing={3}>
          {STATUS_SECTIONS.map(({ status, label, icon }) =>
            grouped[status].length > 0 ? (
              <Box key={status}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    mb: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  {icon}
                  {label} ({grouped[status].length})
                </Typography>
                <Stack spacing={0.5}>
                  {grouped[status].map((entry, index) => (
                    <AttendanceEntryRow
                      key={`${status}:${entry.kind}:${entry.name}:${index}`}
                      entry={entry}
                    />
                  ))}
                </Stack>
              </Box>
            ) : null
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
