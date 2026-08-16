import { Inventory2Outlined } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { GearInventoryManager } from "@/components/features/gear/GearInventoryManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearInventoryContext } from "@/lib/actions/gear-context";

interface GearInventoryPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function GearInventoryPage({ params }: GearInventoryPageProps) {
  const { leagueId } = await params;
  const data = await getGearInventoryContext(leagueId);
  if (!data) notFound();

  const hasInventory = data.catalogItems.length > 0 || data.locations.length > 0 || data.units.length > 0 || data.pooledStock.length > 0;

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Gear inventory"
        subtitle={`${data.league.name} equipment, locations, and current availability.`}
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
