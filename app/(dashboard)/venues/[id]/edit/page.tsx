import { Container, Box } from "@mui/material";
import { notFound, redirect } from "next/navigation";
import { getVenuePageData, getVenueFormContext } from "@/lib/actions/venues";
import VenueForm from "@/components/features/venues/VenueForm";

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, formContext] = await Promise.all([
    getVenuePageData(id),
    getVenueFormContext(),
  ]);

  if (!data) {
    notFound();
  }

  if (!data.canEdit) {
    redirect(`/venues/${id}`);
  }

  const venue = data.venue!;

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueForm
          venueId={venue.id}
          initialData={{
            name: venue.name,
            address: venue.address || "",
            city: venue.city || "",
            state: venue.state || "",
            zipCode: venue.zipCode || "",
            surfaceType: venue.surfaceType,
            capacity: venue.capacity,
            amenities: venue.amenities,
            phone: venue.phone || "",
            website: venue.website || "",
            notes: venue.notes || "",
            visibility: venue.visibility,
            teamId: venue.teamId || "",
            leagueId: venue.leagueId || "",
          }}
          teams={formContext?.teams ?? []}
          leagues={formContext?.leagues ?? []}
        />
      </Box>
    </Container>
  );
}
