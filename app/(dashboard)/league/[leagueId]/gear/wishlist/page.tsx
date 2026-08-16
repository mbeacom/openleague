import { Alert, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { GearWishlistAdminActions } from "@/components/features/gear/GearWishlistAdminActions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearPledgeAdminContext } from "@/lib/actions/gear-pledges";
import { getGearWishlistAdminContext } from "@/lib/actions/gear-wishlist";

export default async function GearWishlistAdminPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const [wishlist, pledges] = await Promise.all([
    getGearWishlistAdminContext(leagueId),
    getGearPledgeAdminContext(leagueId),
  ]);
  if (!wishlist) notFound();

  return (
    <PageContainer maxWidth="lg">
      <PageHeader title="Public gear wishlist" subtitle="Curated public donation requests and private pledge coordination." />
      <Stack spacing={2}>
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
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Private donor pledge queue</Typography>
          <Alert severity="info" sx={{ mb: 1 }}>Donor contact information is visible only to league administrators.</Alert>
          <Stack divider={<Divider flexItem />}>
            {pledges.length === 0 ? <Typography color="text.secondary">No pledges yet.</Typography> : pledges.map((pledge) => (
              <Stack key={pledge.id} spacing={0.5} py={1}>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography>{pledge.wishlistItem.nameSnapshot}: {pledge.quantity}</Typography>
                  <Chip size="small" label={pledge.status} />
                </Stack>
                <Typography variant="body2">{pledge.donorName}{pledge.donorEmail ? ` · ${pledge.donorEmail}` : ""}{pledge.donorPhone ? ` · ${pledge.donorPhone}` : ""}</Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
