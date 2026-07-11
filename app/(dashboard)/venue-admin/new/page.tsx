import { VenueOrganizationOnboarding } from "@/components/features/venue-admin";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NewVenueOrganizationPage() {
  return (
    <PageContainer maxWidth="md">
      <PageHeader title="New Venue Organization" />
      <VenueOrganizationOnboarding />
    </PageContainer>
  );
}
