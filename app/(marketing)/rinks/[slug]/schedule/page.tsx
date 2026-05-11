import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getSkillLevelReferences } from "@/lib/actions/venue-content";
import { getPublicVenueSchedule } from "@/lib/actions/venue-schedules";
import { AvailableIceBrowser, IceTimeRequestForm, PublicRinkFilters, VenueScheduleCalendar } from "@/components/features/venue-admin";

export const dynamic = "force-dynamic";

interface PublicRinkSchedulePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ level?: string }>;
}

export default async function PublicRinkSchedulePage({ params, searchParams }: PublicRinkSchedulePageProps) {
  const { slug } = await params;
  const { level } = await searchParams;
  const [venue, skillLevels] = await Promise.all([
    getPublicVenueSchedule(slug, level ? { skillLevelIds: [level] } : {}),
    getSkillLevelReferences(),
  ]);

  if (!venue) {
    notFound();
  }

  const requestableBlocks = venue.scheduleBlocks.filter((block) => block.registrationMode === "REQUEST_REQUIRED");

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: { xs: 8, md: 10 } }}>
        <Typography variant="h3" component="h1">
          {venue.name} Schedule
        </Typography>
        <PublicRinkFilters skillLevels={skillLevels} basePath={`/rinks/${slug}/schedule`} />
        <VenueScheduleCalendar blocks={venue.scheduleBlocks.map((block) => ({ ...block, status: "PUBLISHED" }))} />
        <AvailableIceBrowser blocks={requestableBlocks} />
        {requestableBlocks.map((block) => (
          <IceTimeRequestForm
            key={block.id}
            scheduleBlockId={block.id}
            venueId={venue.id}
            venueName={venue.name}
            startsAt={block.startsAt}
            endsAt={block.endsAt}
          />
        ))}
      </Stack>
    </Container>
  );
}
