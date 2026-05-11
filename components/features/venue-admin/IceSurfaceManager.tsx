import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface IceSurfaceSummary {
  id: string;
  name: string;
  surfaceType: string;
  isActive: boolean;
  capacity?: number | null;
}

interface IceSurfaceManagerProps {
  organizationId: string;
  venueId: string;
  surfaces?: IceSurfaceSummary[];
}

export function IceSurfaceManager({ organizationId, venueId, surfaces = [] }: IceSurfaceManagerProps) {
  return (
    <Card aria-labelledby="ice-surfaces-heading">
      <CardContent>
        <Stack spacing={2} data-organization-id={organizationId} data-venue-id={venueId}>
          <Typography id="ice-surfaces-heading" variant="h6" component="h2">
            Ice surfaces
          </Typography>
          {surfaces.length > 0 ? (
            <Stack spacing={1}>
              {surfaces.map((surface) => (
                <Stack key={surface.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography fontWeight={700}>{surface.name}</Typography>
                  <Chip size="small" label={surface.surfaceType} />
                  <Chip size="small" color={surface.isActive ? "success" : "default"} label={surface.isActive ? "Active" : "Archived"} />
                  {surface.capacity ? <Typography variant="body2">Capacity {surface.capacity}</Typography> : null}
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No ice surfaces have been added yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}