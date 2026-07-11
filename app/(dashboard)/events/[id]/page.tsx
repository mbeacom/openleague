import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { notFound } from "next/navigation";
import EventDetail from "@/components/features/events/EventDetail";
import { PageContainer } from "@/components/ui/PageContainer";

interface EventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const [userId, { id }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  return (
    <PageContainer>
      <EventDetail
        event={event}
        userRole={event.userRole}
        currentUserId={userId}
      />
    </PageContainer>
  );
}
