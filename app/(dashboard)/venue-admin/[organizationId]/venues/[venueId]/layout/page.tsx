import { notFound } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { requireVenueProfileManager } from "@/lib/auth/session";
import { getVenueLayout } from "@/lib/actions/venue-layout";
import { VenueLayoutEditor } from "@/components/features/venue-admin/VenueLayoutEditor";

interface VenueLayoutPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueLayoutPage({ params }: VenueLayoutPageProps) {
  const { organizationId, venueId } = await params;
  await requireVenueProfileManager(organizationId, venueId);

  const venue = await prisma.venue.findFirst({
    where: { id: venueId, organizationId },
    select: { name: true },
  });
  if (!venue) {
    notFound();
  }

  const result = await getVenueLayout(venueId);
  if (!result.success) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title={`Facility Layout — ${venue.name}`}
        subtitle="Arrange surfaces on a schematic map and add landmark labels. A saved layout appears on the public rink profile."
        breadcrumbs={
          <LinkButton
            href={`/venue-admin/${organizationId}/venues/${venueId}/profile`}
            startIcon={<ArrowBackIcon />}
            size="small"
          >
            Back to venue profile
          </LinkButton>
        }
      />
      <VenueLayoutEditor
        organizationId={organizationId}
        venueId={venueId}
        initialLayout={result.data.layout}
        surfaces={result.data.surfaces}
      />
    </PageContainer>
  );
}
