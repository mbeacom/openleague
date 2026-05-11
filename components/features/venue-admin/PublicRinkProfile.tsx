import Link from "next/link";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import type { PublicVenueProfile, PublicVenueSummary } from "@/lib/utils/public-venues";

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
            <Button component={Link} href={`/rinks/${venue.slug}`} variant="outlined">
              View rink profile
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PublicRinkProfile({ venue }: { venue: PublicVenueProfile }) {
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
              <Button component={Link} href={venue.website} target="_blank" rel="noopener noreferrer">
                Visit website
              </Button>
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
    </Stack>
  );
}
