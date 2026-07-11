import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVenueRelationshipAdminData } from "@/lib/actions/venue-relationships";
import { VenueRelationshipManager } from "@/components/features/venue-admin";

interface VenueRelationshipsAdminPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueRelationshipsAdminPage({ params }: VenueRelationshipsAdminPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueRelationshipAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="Venue Relationships" />
      <VenueRelationshipManager relationships={result.data.relationships} />
    </PageContainer>
  );
}
