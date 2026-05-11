"use client";

import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface SurfaceSummary {
  id: string;
  name: string;
  surfaceType: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface IceSurfaceManagerProps {
  organizationId: string;
  venueId: string;
  surfaces: SurfaceSummary[];
}

export function IceSurfaceManager({ organizationId: _organizationId, venueId: _venueId, surfaces }: IceSurfaceManagerProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Ice surfaces</Typography>
      {surfaces.length === 0 ? (
        <Typography color="text.secondary">No surfaces have been configured yet.</Typography>
      ) : (
        surfaces.map((surface) => (
          <Card key={surface.id}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h6">{surface.name}</Typography>
                <Chip label={surface.surfaceType} size="small" />
                {surface.isDefault ? <Chip label="Default" color="primary" size="small" /> : null}
                {!surface.isActive ? <Chip label="Archived" size="small" /> : null}
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
