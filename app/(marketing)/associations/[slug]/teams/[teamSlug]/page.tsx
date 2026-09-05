import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";

import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { Crest } from "@/components/ui/Crest";
import {
  getPublicTeamProfile,
  resolvePublicAssociation,
} from "@/lib/actions/association-profile";
import { getPublicTeamScheduleItems } from "@/lib/data/schedule-items";
import { formatDateTime } from "@/lib/utils/date";

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
  const now = new Date();
  const scheduleItems = await getPublicTeamScheduleItems(association.id, team.id, {
    from: now,
    to: new Date(now.getTime() + 90 * 86_400_000),
  });

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="center">
          {/* Always rendered — a team with no artwork still gets a monogram
              crest rather than an empty space where identity should be. */}
          {/* No brandColor: the public team select is a deliberate privacy
              boundary and is not widened for a cosmetic field. Without one the
              crest derives its hue from the team id, which is still distinct. */}
          <Crest name={team.name} id={team.id} logoUrl={team.logoUrl} size="xl" />
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
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <LinkButton href={base} variant="outlined" sx={{ minHeight: 44 }}>
            {leagueName}
          </LinkButton>
          <LinkButton href="#schedule" variant="outlined" sx={{ minHeight: 44 }}>
            Schedule
          </LinkButton>
        </Stack>

        <div id="schedule">
          <Typography variant="h5" component="h2" gutterBottom>
            Team schedule
          </Typography>
          {scheduleItems.length === 0 ? (
            <Typography color="text.secondary">
              Nothing public is scheduled for this team in the next 90 days.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {scheduleItems.map((item) => (
                <Card key={item.canonicalScheduleId} variant="outlined">
                  <CardContent>
                    <Typography variant="h6" component="h3">
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDateTime(item.startsAt)}
                      {item.venueName ? ` · ${item.venueName}` : ""}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </div>

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
