import { notFound, redirect } from "next/navigation";
import { Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

import { LinkButton } from "@/components/ui/NextLinkComposites";
import { resolvePublicAssociation } from "@/lib/actions/association-profile";
import { getPublicAssociationScheduleItems } from "@/lib/data/schedule-items";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/date";
import { publicPublishedAssociationWhere } from "@/lib/utils/public-associations";

export const dynamic = "force-dynamic";

/**
 * Canonical public association schedule (feature 007 / User Story 4).
 *
 * Reads through `getPublicAssociationScheduleItems`, which is the canonical
 * reservation-backed reader required by ADR-0007 — this page does not re-derive
 * occupancy from Events, SeasonGames, or schedule blocks, and so cannot show a
 * game twice or disagree with the ICS feed at
 * /api/associations/[slug]/schedule.ics, which reads the same function.
 *
 * `publicOnly` inside that reader is what applies the visibility filter; this
 * page adds no filtering of its own and must not, or the two surfaces would
 * drift apart.
 */
export default async function PublicAssociationSchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolvePublicAssociation(slug);
  if (!resolved) notFound();
  if (resolved.canonicalSlug !== slug) {
    redirect(`/associations/${resolved.canonicalSlug}/schedule`);
  }

  const now = new Date();
  const [association, items] = await Promise.all([
    prisma.league.findFirst({
      where: { ...publicPublishedAssociationWhere, id: resolved.id },
      select: { name: true },
    }),
    getPublicAssociationScheduleItems(resolved.id, {
      from: now,
      to: new Date(now.getTime() + 90 * 86_400_000),
    }),
  ]);
  if (!association) notFound();

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h3" component="h1">
            {association.name} schedule
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The next 90 days of public activity.
          </Typography>
        </div>

        <Stack direction="row" spacing={2}>
          <LinkButton
            href={`/associations/${resolved.canonicalSlug}`}
            variant="outlined"
            sx={{ minHeight: 44 }}
          >
            ← {association.name}
          </LinkButton>
          <LinkButton
            href={`/api/associations/${resolved.canonicalSlug}/schedule.ics`}
            variant="outlined"
            sx={{ minHeight: 44 }}
          >
            Subscribe (.ics)
          </LinkButton>
        </Stack>

        {items.length === 0 ? (
          <Typography color="text.secondary">
            Nothing public is scheduled in the next 90 days.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {items.map((item) => (
              <Card key={item.canonicalScheduleId} variant="outlined">
                <CardContent>
                  <Typography variant="h6" component="h2">
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(item.startsAt)}
                    {item.venueName ? ` · ${item.venueName}` : ""}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    {item.teamName ? <Chip size="small" label={item.teamName} /> : null}
                    {item.divisionName ? (
                      <Chip size="small" variant="outlined" label={item.divisionName} />
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
