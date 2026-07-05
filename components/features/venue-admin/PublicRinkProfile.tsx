import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import type { PublicVenueProfile, PublicVenueSummary } from "@/lib/utils/public-venues";

interface PublicVenueRelationship {
  id: string;
  relationshipType: string;
  targetType: string;
  targetName?: string | null;
  team?: { name: string } | null;
  league?: { name: string } | null;
}

export function PublicRinkProfileCard({ venue }: { venue: PublicVenueSummary }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" component="h2">
              {venue.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[venue.city, venue.state].filter(Boolean).join(", ")}
            </Typography>
          </Box>
          {venue.publicDescription ? (
            <Typography variant="body2">{venue.publicDescription}</Typography>
          ) : null}
          {venue.slug ? (
            <LinkButton href={`/rinks/${venue.slug}`} variant="outlined">
              View rink profile
            </LinkButton>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PublicRinkProfile({
  venue,
  relationships = [],
}: {
  venue: PublicVenueProfile;
  relationships?: PublicVenueRelationship[];
}) {
  return (
    <Stack spacing={4}>
      <Box
        sx={{
          borderRadius: 3,
          p: { xs: 3, md: 5 },
          bgcolor: venue.brandPrimaryColor || "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Typography variant="h3" component="h1" gutterBottom>
          {venue.name}
        </Typography>
        <Typography variant="h6">
          {[venue.city, venue.state].filter(Boolean).join(", ")}
        </Typography>
      </Box>
      {venue.publicDescription ? (
        <Typography variant="body1">{venue.publicDescription}</Typography>
      ) : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Contact
            </Typography>
            {venue.publicEmail ? <Typography>{venue.publicEmail}</Typography> : null}
            {venue.publicPhone ? <Typography>{venue.publicPhone}</Typography> : null}
            {venue.website ? (
              <LinkButton href={venue.website} target="_blank" rel="noopener noreferrer">
                Visit website
              </LinkButton>
            ) : null}
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Surfaces
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {venue.surfaces.map((surface) => (
                <Chip key={surface.id} label={`${surface.name} (${surface.surfaceType})`} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
      {relationships.length > 0 ? (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h5">Preferred and home teams</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {relationships.map((relationship) => {
                  const label = relationship.team?.name ?? relationship.league?.name ?? relationship.targetName ?? relationship.targetType;
                  return (
                    <Chip
                      key={relationship.id}
                      label={`${label} (${relationship.relationshipType})`}
                      color={relationship.relationshipType === "HOME" ? "primary" : "default"}
                    />
                  );
                })}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Upcoming public schedule</Typography>
            {venue.scheduleBlocks.length === 0 ? (
              <Typography color="text.secondary">No public schedule blocks are currently published.</Typography>
            ) : (
              venue.scheduleBlocks.map((block) => (
                <Box key={block.id}>
                  <Typography variant="subtitle1">{block.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(block.startsAt).toLocaleString()} - {new Date(block.endsAt).toLocaleString()}
                    {block.surface ? ` · ${block.surface.name}` : ""}
                  </Typography>
                </Box>
              ))
            )}
            {venue.slug ? (
              <LinkButton href={`/rinks/${venue.slug}/schedule`} variant="outlined">
                View full schedule
              </LinkButton>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
