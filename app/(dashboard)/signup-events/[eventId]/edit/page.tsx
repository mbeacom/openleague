import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getManagedSignupEvent, listVenueOptions } from "@/lib/actions/signup-events";
import { EventForm } from "@/components/features/signup-events";

export const dynamic = "force-dynamic";

export default async function EditSignupEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, venueOptions] = await Promise.all([getManagedSignupEvent(eventId), listVenueOptions()]);
  if (!event) {
    notFound();
  }

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1">
          Edit — {event.title}
        </Typography>
        <EventForm
          hostOptions={[]}
          venueOptions={venueOptions}
          initialValues={{
            eventId: event.id,
            title: event.title,
            description: event.description,
            category: event.category,
            ageClassification: event.ageClassification,
            visibility: event.visibility,
            startAt: event.startAt,
            endAt: event.endAt,
            venueId: event.venueId,
            locationText: event.locationText,
            registrationOpensAt: event.registrationOpensAt,
            registrationClosesAt: event.registrationClosesAt,
            cancellationCutoffAt: event.cancellationCutoffAt,
            contactName: event.contactName,
            contactEmail: event.contactEmail,
            contactPhone: event.contactPhone,
            acceptsOnlinePayment: event.acceptsOnlinePayment,
            acceptsManualPayment: event.acceptsManualPayment,
            venmoHandle: event.venmoHandle,
            zelleHandle: event.zelleHandle,
            cashAppHandle: event.cashAppHandle,
            paymentPhone: event.paymentPhone,
            paymentInstructions: event.paymentInstructions,
            galleryEnabled: event.galleryEnabled,
            publicRoster: event.publicRoster,
            slots: event.slots.map((slot) => ({
              id: slot.id,
              name: slot.name,
              description: slot.description,
              capacity: slot.capacity,
              priceAmount: slot.priceAmount,
              waitlistEnabled: slot.waitlistEnabled,
              registrationCount: slot._count.registrations,
            })),
          }}
        />
      </Stack>
    </Container>
  );
}
