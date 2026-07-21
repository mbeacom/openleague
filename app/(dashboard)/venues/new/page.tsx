import { redirect } from "next/navigation";
import { getVenueFormContext } from "@/lib/actions/venues";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, VENUE_PROFILE_ROLES } from "@/lib/auth/session";
import VenueForm from "@/components/features/venues/VenueForm";
import { PageContainer } from "@/components/ui/PageContainer";

export default async function NewVenuePage() {
  const context = await getVenueFormContext();
  if (!context) {
    // Venue-organization managers create venues from the venue-admin area;
    // without this check they were silently bounced back to /venues with no
    // way to create a venue anywhere.
    const userId = await requireUserId();
    const orgStaff = await prisma.venueStaff.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        role: { in: [...VENUE_PROFILE_ROLES] },
        organization: { status: { in: ["DRAFT", "ACTIVE"] } },
      },
      select: { id: true },
    });
    redirect(orgStaff ? "/venue-admin" : "/venues");
  }

  return (
    <PageContainer maxWidth="md">
      <VenueForm teams={context.teams} leagues={context.leagues} />
    </PageContainer>
  );
}
