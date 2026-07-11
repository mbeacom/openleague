import { redirect } from "next/navigation";
import { getVenueFormContext } from "@/lib/actions/venues";
import VenueForm from "@/components/features/venues/VenueForm";
import { PageContainer } from "@/components/ui/PageContainer";

export default async function NewVenuePage() {
  const context = await getVenueFormContext();
  if (!context) {
    redirect("/venues");
  }

  return (
    <PageContainer maxWidth="md">
      <VenueForm teams={context.teams} leagues={context.leagues} />
    </PageContainer>
  );
}
