import { notFound } from "next/navigation";
import { Container, Stack } from "@mui/material";
import { PublicRinkContent, PublicRinkProfile } from "@/components/features/venue-admin";
import { PublicVenueMap } from "@/components/features/venues/PublicVenueMap";
import { getPublicVenueContent } from "@/lib/actions/venue-content";
import { getPublicRinkProfile } from "@/lib/actions/venue-organizations";
import { getPublicVenueRelationships } from "@/lib/actions/venue-relationships";
import type { VenueLayoutData } from "@/types/segments";

export const dynamic = "force-dynamic";

interface PublicRinkPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicRinkPage({ params }: PublicRinkPageProps) {
  const { slug } = await params;
  const venue = await getPublicRinkProfile(slug);

  if (!venue) {
    notFound();
  }

  const [content, relationships] = await Promise.all([
    getPublicVenueContent(venue.id),
    getPublicVenueRelationships(venue.id),
  ]);

  // Optional schematic facility map (FR-017): render only when a layout has
  // been saved; otherwise the existing list presentation stands alone.
  const layout = (venue.layout as unknown as VenueLayoutData | null) ?? null;

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: { xs: 8, md: 10 } }}>
        <PublicRinkProfile venue={venue} relationships={relationships} />
        {layout ? (
          <PublicVenueMap layout={layout} surfaces={venue.surfaces} venueName={venue.name} />
        ) : null}
        <PublicRinkContent posts={content.posts} lessons={content.lessons} events={content.events} />
      </Stack>
    </Container>
  );
}
