import { Inventory2Outlined } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { GearInventoryManager } from "@/components/features/gear/GearInventoryManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearInventoryContext } from "@/lib/actions/gear-context";

interface GearInventoryPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ activityPage?: string; activitySearch?: string }>;
}

export default async function GearInventoryPage({ params, searchParams }: GearInventoryPageProps) {
  const { leagueId } = await params;
  const query = await searchParams;
  const activityPage = Number.parseInt(query.activityPage ?? "1", 10);
  const data = await getGearInventoryContext(leagueId, {
    activityPage: Number.isFinite(activityPage) ? activityPage : 1,
    activitySearch: query.activitySearch,
  });
  if (!data) notFound();

  const hasInventory = data.units.length > 0 || data.pooledStock.length > 0;

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Gear inventory"
        subtitle={`${data.league.name} equipment, locations, and current availability.`}
        actions={
          <LinkButton
            href={`/league/${leagueId}/gear/reservations`}
            variant="outlined"
            sx={{ minHeight: 44 }}
          >
            Reservations
          </LinkButton>
        }
      />
      {hasInventory || data.canManageInventory ? (
        <GearInventoryManager data={data} />
      ) : (
        <EmptyState
          icon={<Inventory2Outlined />}
          title="No association gear is available yet"
          description="League administrators can add locations and catalog items when equipment is ready to track."
        />
      )}
    </PageContainer>
  );
}
