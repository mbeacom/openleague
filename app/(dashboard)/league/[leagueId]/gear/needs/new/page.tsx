import { ArrowBackOutlined } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { GearNeedCreateForm } from "@/components/features/gear/GearNeedCreateForm";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearNeedsContext } from "@/lib/actions/gear-needs";

export default async function NewGearNeedPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const context = await getGearNeedsContext(leagueId);
  if (!context || context.teams.length === 0) notFound();

  return (
    <PageContainer maxWidth="md">
      <LinkButton href={`/league/${leagueId}/gear/needs`} startIcon={<ArrowBackOutlined />} sx={{ minHeight: 44, mb: 1 }}>
        All needs
      </LinkButton>
      <PageHeader title="New gear need" subtitle="Describe a team need for association review. This does not reserve equipment." />
      <GearNeedCreateForm leagueId={leagueId} teams={context.teams} />
    </PageContainer>
  );
}
