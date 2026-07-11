import { notFound } from "next/navigation";
import { getVenuePageData } from "@/lib/actions/venues";
import VenueDetail from "@/components/features/venues/VenueDetail";
import { PageContainer } from "@/components/ui/PageContainer";

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getVenuePageData(id);
  if (!data) {
    notFound();
  }

  return (
    <PageContainer maxWidth="md">
      <VenueDetail
        venue={data.venue!}
        canEdit={data.canEdit}
        upcomingEvents={data.upcomingEvents}
      />
    </PageContainer>
  );
}
