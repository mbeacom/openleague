import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  operatingHours?: OperatingHourSummary[];
}

export function OperatingHoursEditor({ organizationId, venueId, operatingHours = [] }: OperatingHoursEditorProps) {
  return (
    <Card aria-labelledby="operating-hours-heading">
      <CardContent>
        <Stack spacing={2} data-organization-id={organizationId} data-venue-id={venueId}>
          <Typography id="operating-hours-heading" variant="h6" component="h2">
            Operating hours
          </Typography>
          {operatingHours.length > 0 ? (
            <Stack spacing={1}>
              {operatingHours.map((hour) => (
                <Stack key={hour.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography>{`${DAYS[hour.dayOfWeek] ?? "Day"}: ${hour.opensAt}-${hour.closesAt}`}</Typography>
                  <Chip size="small" label={hour.status} />
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Operating hours have not been configured yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}