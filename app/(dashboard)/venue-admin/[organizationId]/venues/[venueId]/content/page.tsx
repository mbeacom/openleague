import { notFound } from "next/navigation";
import { Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVenueContentAdminData } from "@/lib/actions/venue-content";
import { LessonOfferingEditor, SpecialtyEventEditor, VenueContentManager } from "@/components/features/venue-admin";

interface VenueContentAdminPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueContentAdminPage({ params }: VenueContentAdminPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueContentAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="Venue Content" />
      <Stack spacing={4}>
        <LessonOfferingEditor organizationId={organizationId} venueId={venueId} />
        <SpecialtyEventEditor organizationId={organizationId} venueId={venueId} />
        <VenueContentManager posts={result.data.posts} />
      </Stack>
    </PageContainer>
  );
}
