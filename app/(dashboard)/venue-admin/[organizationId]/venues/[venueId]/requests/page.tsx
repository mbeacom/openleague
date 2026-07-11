import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVenueRequestQueue } from "@/lib/actions/venue-requests";
import { IceTimeRequestQueue } from "@/components/features/venue-admin";

interface VenueRequestsPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueRequestsPage({ params }: VenueRequestsPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueRequestQueue(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="Ice Time Requests" />
      <IceTimeRequestQueue requests={result.data.requests} />
    </PageContainer>
  );
}
