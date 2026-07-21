import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { requireVenueProfileManager } from "@/lib/auth/session";
import { AddOrganizationVenueForm } from "@/components/features/venue-admin";

interface NewOrganizationVenuePageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function NewOrganizationVenuePage({
  params,
}: NewOrganizationVenuePageProps) {
  const { organizationId } = await params;
  const userId = await requireVenueProfileManager(organizationId);

  const organization = await prisma.venueOrganization.findFirst({
    where: { id: organizationId, status: { in: ["DRAFT", "ACTIVE"] } },
    select: { id: true, name: true },
  });

  if (!organization) {
    notFound();
  }

  // Standalone venues this user created that can be attached to the org.
  const attachableVenues = await prisma.venue.findMany({
    where: {
      organizationId: null,
      createdById: userId,
      teamId: null,
      leagueId: null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      surfaceType: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Add venue"
        subtitle={`Add a venue to ${organization.name}.`}
      />
      <AddOrganizationVenueForm
        organizationId={organization.id}
        attachableVenues={attachableVenues}
      />
    </PageContainer>
  );
}
