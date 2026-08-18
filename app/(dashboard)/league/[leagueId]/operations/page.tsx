import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import OperationalDashboard from "@/components/features/association-operations/OperationalDashboard";
import {
  getAssociationOperationsData,
  type AssociationOperationsData,
} from "@/lib/data/association-operations";

export const dynamic = "force-dynamic";

export default async function AssociationOperationsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  let data: AssociationOperationsData | null = null;
  let error: string | undefined;
  try {
    data = await getAssociationOperationsData(leagueId);
  } catch (caught) {
    if (caught instanceof Error && caught.message.toLowerCase().includes("unauthorized")) notFound();
    error = "Operations data could not be loaded.";
  }
  return (
    <PageContainer>
      <PageHeader title="Association operations" />
      <OperationalDashboard data={data} error={error} />
    </PageContainer>
  );
}
