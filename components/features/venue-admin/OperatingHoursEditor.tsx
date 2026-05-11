"use client";

import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface OperatingHourSummary {
  id: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  status: string;
}

interface OperatingHoursEditorProps {
  organizationId: string;
  venueId: string;
  operatingHours: OperatingHourSummary[];
}

export function OperatingHoursEditor({ organizationId: _organizationId, venueId: _venueId, operatingHours }: OperatingHoursEditorProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Operating hours</Typography>
      {operatingHours.length === 0 ? (
        <Typography color="text.secondary">No operating hours have been configured yet.</Typography>
      ) : (
        operatingHours.map((hour) => (
          <Card key={hour.id}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography>
                  {dayLabels[hour.dayOfWeek] ?? "Day"}: {hour.opensAt}-{hour.closesAt}
                </Typography>
                <Chip label={hour.status} size="small" />
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
