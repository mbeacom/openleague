import { notFound, redirect } from "next/navigation";
import { Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import {
  getPublicTeamProfile,
  resolvePublicAssociation,
} from "@/lib/actions/association-profile";

export const dynamic = "force-dynamic";

/**
 * Public team page.
 *
 * Shows approved team identity and its public news. There is deliberately no
 * roster here: players, guardians, emergency contacts, and jersey numbers are
 * never selected by publicTeamSummarySelect, so this page cannot render them
 * however it is edited later.
 */
export default async function PublicTeamPage({
  params,
}: {
  params: Promise<{ slug: string; teamSlug: string }>;
}) {
  const { slug, teamSlug } = await params;

  const association = await resolvePublicAssociation(slug);
  if (!association) notFound();
  if (association.canonicalSlug !== slug) {
    redirect(`/associations/${association.canonicalSlug}/teams/${teamSlug}`);
  }

  const team = await getPublicTeamProfile(association.id, teamSlug);
  if (!team) notFound();
  if (team.canonicalSlug !== teamSlug) {
    redirect(`/associations/${association.canonicalSlug}/teams/${team.canonicalSlug}`);
  }

  // Team.leagueId is nullable — teams can exist outside an association — so
  // the relation is optional even though a published one always resolves here.
  const leagueName = team.league?.name ?? "Association";
  const base = `/associations/${association.canonicalSlug}`;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={4}>
        <div>
          <Typography variant="overline" color="text.secondary">
            {leagueName}
          </Typography>
          <Typography variant="h3" component="h1">
            {team.name}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {team.division?.name ? <Chip size="small" label={team.division.name} /> : null}
            <Chip size="small" label={team.season} />
          </Stack>
          {team.publicDescription ? (
            <Typography variant="body1" sx={{ mt: 2 }}>
              {team.publicDescription}
            </Typography>
          ) : null}
        </div>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <LinkButton href={base} variant="outlined" sx={{ minHeight: 44 }}>
            {leagueName}
          </LinkButton>
          <LinkButton href={`${base}/schedule`} variant="outlined" sx={{ minHeight: 44 }}>
            Schedule
          </LinkButton>
        </Stack>

        {team.publicContentItems.length > 0 ? (
          <div>
            <Typography variant="h5" component="h2" gutterBottom>
              Team news
            </Typography>
            <Stack spacing={2}>
              {team.publicContentItems.map((item) => (
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
                    </CardContent>
                  </LinkCardActionArea>
                </Card>
              ))}
            </Stack>
          </div>
        ) : null}
      </Stack>
    </Container>
  );
}
