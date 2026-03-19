"use client";

import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  Grid,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

interface Schedule {
  id: string;
  name: string;
  seasonName: string | null;
  startDate: string;
  endDate: string;
  status: string;
  roundRobin: boolean;
  rounds: number;
  createdBy: { id: string; name: string | null } | null;
  league: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  _count: { games: number };
}

interface ScheduleListProps {
  schedules: Schedule[];
  isAdmin: boolean;
}

const statusColors: Record<string, "warning" | "success" | "default"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "default",
};

export default function ScheduleList({ schedules, isAdmin }: ScheduleListProps) {
  const router = useRouter();

  if (schedules.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: 2,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No schedules yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isAdmin
            ? "Create a schedule to generate a full season of games."
            : "No schedules have been created yet."}
        </Typography>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/schedules/new")}
          >
            Create Schedule
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {isAdmin && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/schedules/new")}
          >
            Create Schedule
          </Button>
        </Box>
      )}

      <Grid container spacing={2}>
        {schedules.map((schedule) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={schedule.id}>
            <Card
              onClick={() => router.push(`/schedules/${schedule.id}`)}
              sx={{
                cursor: "pointer",
                transition: "transform 0.15s, box-shadow 0.15s",
                "&:hover": { transform: "translateY(-2px)", boxShadow: 4 },
              }}
            >
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Typography variant="h6" component="h3" noWrap sx={{ flex: 1, mr: 1 }}>
                    {schedule.name}
                  </Typography>
                  <Chip
                    label={schedule.status}
                    color={statusColors[schedule.status] || "default"}
                    size="small"
                  />
                </Box>

                {schedule.seasonName && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {schedule.seasonName}
                  </Typography>
                )}

                <Typography variant="body2" color="text.secondary">
                  {new Date(schedule.startDate).toLocaleDateString()} &ndash;{" "}
                  {new Date(schedule.endDate).toLocaleDateString()}
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Chip
                    label={`${schedule._count.games} games`}
                    size="small"
                    variant="outlined"
                  />
                  {schedule.roundRobin && (
                    <Chip
                      label={`Round Robin (${schedule.rounds}x)`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {schedule.league && (
                    <Chip label={schedule.league.name} size="small" variant="outlined" />
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
