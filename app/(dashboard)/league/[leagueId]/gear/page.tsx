import { Inventory2Outlined } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { GearInventoryManager } from "@/components/features/gear/GearInventoryManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearInventoryContext } from "@/lib/actions/gear-context";
import { parseGearActivitySearchParams } from "@/lib/utils/gear-activity-query";

interface GearInventoryPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ activityPage?: string | string[]; activitySearch?: string | string[] }>;
}

export default async function GearInventoryPage({ params, searchParams }: GearInventoryPageProps) {
  const { leagueId } = await params;
  const activityOptions = parseGearActivitySearchParams(await searchParams);
  const data = await getGearInventoryContext(leagueId, activityOptions);
  if (!data) notFound();

  const hasInventory = data.catalogItems.length > 0 || data.locations.length > 0 || data.units.length > 0 || data.pooledStock.length > 0;

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Gear inventory"
        subtitle={`${data.league.name} equipment, locations, and current availability.`}
        actions={
          <>
            <LinkButton href={`/league/${leagueId}/gear/needs`} variant="outlined" sx={{ minHeight: 44 }}>
              Needs
            </LinkButton>
            <LinkButton href={`/league/${leagueId}/gear/reservations`} variant="outlined" sx={{ minHeight: 44 }}>
              Reservations
            </LinkButton>
            {data.canManageInventory && (
              <LinkButton href={`/league/${leagueId}/gear/wishlist`} variant="outlined" sx={{ minHeight: 44 }}>
                Wishlist
              </LinkButton>
            )}
          </>
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
