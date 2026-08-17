import { AssignmentOutlined } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { GearReservationList } from "@/components/features/gear/GearReservationList";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { GearReservationRequestDialog } from "@/components/features/gear/GearReservationRequestDialog";
import { getGearReservationContext } from "@/lib/actions/gear-context";

interface GearReservationsPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function GearReservationsPage({ params }: GearReservationsPageProps) {
  const { leagueId } = await params;
  const data = await getGearReservationContext(leagueId);
  if (!data) notFound();

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Gear reservations"
        subtitle={`${data.league.name} equipment requests, custody, and return status.`}
        actions={<GearReservationRequestDialog data={data} />}
      />
      {data.teamIds.length > 0 ? (
        <GearReservationList data={data} />
      ) : (
        <EmptyState
          icon={<AssignmentOutlined />}
          title="No team gear access"
          description="Join a league team to view its equipment reservations."
        />
      )}
    </PageContainer>
  );
}
