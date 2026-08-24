import { notFound, redirect } from "next/navigation";
import { Card, CardContent, Container, Stack, Typography } from "@mui/material";

import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import {
  getPublicAssociationTeams,
  resolvePublicAssociation,
} from "@/lib/actions/association-profile";
import { prisma } from "@/lib/db/prisma";
import { publicPublishedAssociationWhere } from "@/lib/utils/public-associations";

export const dynamic = "force-dynamic";

/** Public team directory. One activation from the association home (SC-007). */
export default async function PublicAssociationTeamsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolvePublicAssociation(slug);
  if (!resolved) notFound();
  if (resolved.canonicalSlug !== slug) {
    redirect(`/associations/${resolved.canonicalSlug}/teams`);
  }

  const [association, teams] = await Promise.all([
    prisma.league.findFirst({
      where: { ...publicPublishedAssociationWhere, id: resolved.id },
      select: { name: true },
    }),
    getPublicAssociationTeams(resolved.id),
  ]);
  if (!association) notFound();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
      <Typography variant="h3" component="h1" gutterBottom>
        {association.name} teams
      </Typography>

      {teams.length === 0 ? (
        <Typography color="text.secondary">No teams have been published yet.</Typography>
      ) : (
        <Stack spacing={2} sx={{ mt: 3 }}>
          {teams.map((team) => (
            <Card key={team.id} variant="outlined">
              <LinkCardActionArea href={`/associations/${resolved.canonicalSlug}/teams/${team.slug}`}>
                <CardContent>
                  <Typography variant="h6" component="h2">
                    {team.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {team.division?.name ?? "No division"} · {team.season}
                  </Typography>
                </CardContent>
              </LinkCardActionArea>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
