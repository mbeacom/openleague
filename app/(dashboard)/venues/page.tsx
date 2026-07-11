import { redirect } from "next/navigation";
import { getAvailableVenues, getVenuesPageAccess } from "@/lib/actions/venues";
import VenueList from "@/components/features/venues/VenueList";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function VenuesPage() {
  const access = await getVenuesPageAccess();
  if (!access) {
    redirect("/");
  }

  const venues = await getAvailableVenues();

  return (
    <PageContainer>
      <PageHeader
        title="Venues"
        subtitle="Manage rinks, fields, and facilities for scheduling games and practices."
      />
      <VenueList venues={venues} isAdmin={access.isAdmin} />
    </PageContainer>
  );
}
