import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";

import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { Crest } from "@/components/ui/Crest";
import { contrastTextFor } from "@/lib/utils/contrast-color";
import { formatSport } from "@/lib/utils/validation";

/**
 * The public association landing page (feature 007 / User Story 4).
 *
 * SC-007 requires every published team, the public schedule, public signup
 * events, public announcements, and an active public wishlist to be reachable
 * from here in no more than three activations. Everything below is one
 * activation away, which leaves two to spare for the pages themselves.
 *
 * A Server Component: all links go through the NextLinkComposites wrappers.
 * `component={Link}` on a MUI element from an RSC compiles, type-checks, and
 * passes tests, then crashes at runtime.
 */

export interface PublicAssociationProfileProps {
  association: {
    id: string;
    name: string;
    slug: string | null;
    sport: string;
    publicDescription: string | null;
    logoUrl: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
    publicEmail: string | null;
    publicPhone: string | null;
    divisions: Array<{ id: string; name: string; ageGroup: string | null }>;
    teams: Array<{
      id: string;
      name: string;
      slug: string | null;
      season: string;
      division: { name: string; ageGroup: string | null } | null;
    }>;
    publicContentItems: Array<{
      id: string;
      slug: string;
      title: string;
      summary: string | null;
      publishAt: Date | null;
      team: { name: string; slug: string | null } | null;
    }>;
    gearWishlist: { shareToken: string; title: string } | null;
  };
}

export function PublicAssociationProfile({ association }: PublicAssociationProfileProps) {
  const base = `/associations/${association.slug}`;

  return (
    <Stack spacing={5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={3}
        alignItems="center"
        sx={(theme) => ({
          borderRadius: 3,
          borderBottom: "6px solid",
          borderBottomColor: association.brandSecondaryColor || "secondary.main",
          bgcolor: association.brandPrimaryColor || "primary.main",
          color: contrastTextFor(theme, association.brandPrimaryColor),
          p: { xs: 3, md: 5 },
        })}
      >
        {/* Always rendered: an association with no artwork still gets a mark,
            which is the point of the monogram fallback. Inverted because this
            hero is painted in the association's own color. */}
        <Crest
          name={association.name}
          id={association.id}
          logoUrl={association.logoUrl}
          brandColor={association.brandPrimaryColor}
          size="xl"
          tone="inverted"
        />
        <Box>
          <Typography variant="h3" component="h1">
            {association.name}
          </Typography>
          <Chip
            size="small"
            label={formatSport(association.sport)}
            sx={{ mt: 1, bgcolor: "background.paper", color: "text.primary" }}
          />
          {association.publicDescription ? (
            <Typography variant="body1" sx={{ mt: 2 }}>
              {association.publicDescription}
            </Typography>
          ) : null}
        </Box>
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <LinkButton href={`${base}/schedule`} variant="contained" sx={{ minHeight: 44 }}>
          Schedule
        </LinkButton>
        <LinkButton href={`${base}/teams`} variant="outlined" sx={{ minHeight: 44 }}>
          Teams
        </LinkButton>
        <LinkButton href={`${base}/events`} variant="outlined" sx={{ minHeight: 44 }}>
          Events &amp; registration
        </LinkButton>
        <LinkButton href={`${base}/news`} variant="outlined" sx={{ minHeight: 44 }}>
          News
        </LinkButton>
        {/* Linked only while the wishlist is published. The token route is the
            existing hardened public surface; no inventory, donor, custodian, or
            location data is read here to render this button. */}
        {association.gearWishlist ? (
          <LinkButton
            href={`/gear-wishlist/${association.gearWishlist.shareToken}`}
            variant="outlined"
            sx={{ minHeight: 44 }}
          >
            {association.gearWishlist.title}
          </LinkButton>
        ) : null}
      </Stack>

      {association.teams.length > 0 ? (
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            Teams
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
              gap: 2,
            }}
          >
            {association.teams.map((team) => (
              <Card key={team.id} variant="outlined">
                <LinkCardActionArea href={`${base}/teams/${team.slug}`} sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography variant="h6" component="h3">
                      {team.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {team.division?.name ?? "No division"} · {team.season}
                    </Typography>
                  </CardContent>
                </LinkCardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      ) : null}

      {association.publicContentItems.length > 0 ? (
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            News
          </Typography>
          <Stack spacing={2}>
            {association.publicContentItems.map((item) => (
              <Card key={item.id} variant="outlined">
                <LinkCardActionArea href={`${base}/news/${item.slug}`}>
                  <CardContent>
                    <Typography variant="h6" component="h3">
                      {item.title}
                    </Typography>
                    {item.summary ? (
                      <Typography variant="body2" color="text.secondary">
                        {item.summary}
                      </Typography>
                    ) : null}
                    {item.team ? (
                      <Chip size="small" label={item.team.name} sx={{ mt: 1 }} />
                    ) : null}
                  </CardContent>
                </LinkCardActionArea>
              </Card>
            ))}
          </Stack>
        </Box>
      ) : null}

      {association.divisions.length > 0 ? (
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            Divisions
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {association.divisions.map((division) => (
              <Chip
                key={division.id}
                label={
                  division.ageGroup ? `${division.name} · ${division.ageGroup}` : division.name
                }
              />
            ))}
          </Stack>
        </Box>
      ) : null}

      {association.publicEmail || association.publicPhone ? (
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            Contact
          </Typography>
          {/* The association's *public* contact details, which an administrator
              opts into. League.contactEmail / contactPhone are the private
              administrative contact and are never selected for this page. */}
          <Stack spacing={0.5}>
            {association.publicEmail ? (
              <Typography variant="body2">{association.publicEmail}</Typography>
            ) : null}
            {association.publicPhone ? (
              <Typography variant="body2">{association.publicPhone}</Typography>
            ) : null}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

export default PublicAssociationProfile;
