import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { requireVenueProfileManager } from "@/lib/auth/session";
import { VenueProfileEditor } from "@/components/features/venue-admin";

interface VenueProfilePageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueProfilePage({ params }: VenueProfilePageProps) {
  const { organizationId, venueId } = await params;
  await requireVenueProfileManager(organizationId, venueId);

  const venue = await prisma.venue.findFirst({
    where: {
      id: venueId,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      address: true,
      slug: true,
      city: true,
      state: true,
      zipCode: true,
      website: true,
      publicDescription: true,
      logoUrl: true,
      brandPrimaryColor: true,
      brandSecondaryColor: true,
      timezone: true,
      publicEmail: true,
      publicPhone: true,
      privateManagerNotes: true,
      profileStatus: true,
    },
  });

  if (!venue) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="Manage Venue Profile" />
      <VenueProfileEditor organizationId={organizationId} venue={venue} />
    </PageContainer>
  );
}
