import { Alert, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { GearWishlistAdminActions } from "@/components/features/gear/GearWishlistAdminActions";
import { GearWishlistEditor } from "@/components/features/gear/GearWishlistEditor";
import { GearPledgeAdminActions } from "@/components/features/gear/GearPledgeAdminActions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearInventoryContext } from "@/lib/actions/gear-context";
import { getGearPledgeAdminContext } from "@/lib/actions/gear-pledges";
import { getGearWishlistAdminContext } from "@/lib/actions/gear-wishlist";

export default async function GearWishlistAdminPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const [wishlist, pledges, inventory] = await Promise.all([
    getGearWishlistAdminContext(leagueId),
    getGearPledgeAdminContext(leagueId),
    getGearInventoryContext(leagueId),
  ]);
  if (!inventory) return null;

  return (
    <PageContainer maxWidth="lg">
      <PageHeader title="Public gear wishlist" subtitle="Curated public donation requests and private pledge coordination." />
      <Stack spacing={2}>
        {wishlist ? (
          <>
            <Card variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6">{wishlist.title}</Typography>
                {wishlist.description && <Typography color="text.secondary">{wishlist.description}</Typography>}
                <Chip label={wishlist.status} sx={{ alignSelf: "start" }} />
                <GearWishlistAdminActions leagueId={leagueId} shareToken={wishlist.shareToken} status={wishlist.status} version={wishlist.version} />
              </Stack>
            </Card>
            <Card variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Curated public items</Typography>
              <Stack divider={<Divider flexItem />}>
                {wishlist.items.filter((item) => item.isActive).map((item) => (
                  <Stack key={item.id} direction="row" justifyContent="space-between" gap={2} py={1}>
                    <Typography>{item.nameSnapshot}</Typography>
                    <Typography color="text.secondary">{item.receivedQty} received / {item.targetQty} target</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          </>
        ) : (
          <Alert severity="info">Create your first public donation campaign below. Only curated snapshots will be shared publicly.</Alert>
        )}
        <GearWishlistEditor
          leagueId={leagueId}
          catalogItems={inventory.catalogItems}
          initial={wishlist ? {
            title: wishlist.title,
            description: wishlist.description,
            version: wishlist.version,
            items: wishlist.items.filter((item) => item.isActive).map((item) => ({
              catalogItemId: item.catalogItemId ?? "",
              nameSnapshot: item.nameSnapshot,
              categorySnapshot: item.categorySnapshot ?? "",
              sizeSnapshot: item.sizeSnapshot ?? "",
              description: item.description ?? "",
              targetQty: item.targetQty,
            })),
          } : undefined}
        />
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Private donor pledge queue</Typography>
          <Alert severity="info" sx={{ mb: 1 }}>Donor contact information is visible only to league administrators.</Alert>
          <Alert severity="warning" sx={{ mb: 1 }}>Automatic pledge expiry is intentionally deferred. Review pledge age and use “Expire pledge” when a donor commitment is no longer active.</Alert>
          <Stack divider={<Divider flexItem />}>
            {pledges.length === 0 ? <Typography color="text.secondary">No pledges yet.</Typography> : pledges.map((pledge) => (
              <Stack key={pledge.id} spacing={0.5} py={1}>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography>{pledge.wishlistItem.nameSnapshot}: {pledge.quantity}</Typography>
                  <Chip size="small" label={pledge.status} />
                </Stack>
                <Typography variant="body2">{pledge.donorName ?? "Donor details redacted"}{pledge.donorEmail ? ` · ${pledge.donorEmail}` : ""}{pledge.donorPhone ? ` · ${pledge.donorPhone}` : ""}</Typography>
                {pledge.note && <Typography variant="body2" color="text.secondary">Donor note: {pledge.note}</Typography>}
                <Typography variant="body2" color="text.secondary">
                  Created {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(pledge.createdAt))} · {pledge.receipts.reduce((total, receipt) => total + receipt.quantity, 0)} received · {Math.max(pledge.quantity - pledge.receipts.reduce((total, receipt) => total + receipt.quantity, 0), 0)} remaining
                </Typography>
                {pledge.receipts.map((receipt) => (
                  <Typography key={receipt.id} variant="caption" color="text.secondary">
                    Receipt {receipt.id} · {receipt.quantity} · {new Date(receipt.receivedAt).toLocaleString()} · {receipt.poolStockId ? `Pooled stock ${receipt.poolStockId}` : `Unit ${receipt.gearUnitId}`}
                  </Typography>
                ))}
                <GearPledgeAdminActions
                  leagueId={leagueId}
                  pledgeId={pledge.id}
                  pledgeVersion={pledge.version}
                  status={pledge.status}
                  catalogItems={inventory.catalogItems
                    .filter((item) => item.isActive && item.trackingMode === "INDIVIDUAL")
                    .map((item) => ({ id: item.id, name: item.name }))}
                  pooledCatalogItems={inventory.catalogItems
                    .filter((item) => item.isActive && item.trackingMode === "POOLED")
                    .map((item) => ({ id: item.id, name: item.name }))}
                  locations={inventory.locations
                    .filter((location) => location.isActive)
                    .map((location) => ({ id: location.id, name: location.name }))}
                  poolStock={inventory.pooledStock
                    .map((stock) => ({ id: stock.id, catalogName: stock.catalogName, locationName: stock.locationName }))}
                  remainingQuantity={Math.max(pledge.quantity - pledge.receipts.reduce((total, receipt) => total + receipt.quantity, 0), 0)}
                  receipts={pledge.receipts}
                />
              </Stack>
            ))}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
