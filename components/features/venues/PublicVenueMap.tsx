import { Card, CardContent, Stack, Typography } from "@mui/material";
import { VenueLayoutCanvas } from "./VenueLayoutCanvas";
import type { VenueLayoutData } from "@/types/segments";

interface PublicVenueMapProps {
  layout: VenueLayoutData;
  /** Active surfaces only (the public profile query already filters archived). */
  surfaces: Array<{ id: string; name: string }>;
  venueName?: string;
}

/**
 * Public facility map for the rink profile (FR-017). Renders the saved
 * schematic in public view: archived surfaces — anything not in the active
 * surface list — are excluded (FR-018). Server-renderable; returns null when
 * nothing would be visible so the page keeps its list-only presentation.
 */
export function PublicVenueMap({ layout, surfaces, venueName }: PublicVenueMapProps) {
  const surfaceNames = Object.fromEntries(surfaces.map((surface) => [surface.id, surface.name]));
  const visibleSurfaces = (layout.surfaces ?? []).filter(
    (surface) => surfaceNames[surface.surfaceId] !== undefined
  );
  const labels = layout.labels ?? [];

  if (visibleSurfaces.length === 0 && labels.length === 0) {
    return null;
  }

  return (
    <Card component="section" aria-labelledby="facility-map-heading">
      <CardContent>
        <Stack spacing={2}>
          <Typography id="facility-map-heading" variant="h5" component="h2">
            Facility map
          </Typography>
          <VenueLayoutCanvas
            layout={layout}
            surfaceNames={surfaceNames}
            publicView
            ariaLabel={venueName ? `Facility map of ${venueName}` : "Facility map"}
          />
          <Typography variant="body2" color="text.secondary">
            Schematic — not to scale.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
