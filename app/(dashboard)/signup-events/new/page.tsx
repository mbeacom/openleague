import { Alert } from "@mui/material";
import { listMyHostOptions, listVenueOptions } from "@/lib/actions/signup-events";
import { EventForm } from "@/components/features/signup-events";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewSignupEventPage() {
  await requireAuth();
  const [hostOptions, venueOptions] = await Promise.all([listMyHostOptions(), listVenueOptions()]);

  return (
    <PageContainer maxWidth="md">
      <PageHeader title="New signup event" />
      {hostOptions.length === 0 ? (
        <Alert severity="info">
          You need an admin role in a rink organization, association, or team to host signup
          events.
        </Alert>
      ) : (
        <EventForm hostOptions={hostOptions} venueOptions={venueOptions} />
      )}
    </PageContainer>
  );
}
