import Link from "next/link";
import { ArrowBackOutlined } from "@mui/icons-material";
import { Alert, Button, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { GearNeedActions } from "@/components/features/gear/GearNeedActions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearNeedDetail, getGearNeedsContext } from "@/lib/actions/gear-needs";

export default async function GearNeedDetailPage({ params }: { params: Promise<{ leagueId: string; needId: string }> }) {
  const { leagueId, needId } = await params;
  const [need, context] = await Promise.all([getGearNeedDetail(leagueId, needId), getGearNeedsContext(leagueId)]);
  if (!need || !context) notFound();

  return (
    <PageContainer maxWidth="md">
      <Button component={Link} href={`/league/${leagueId}/gear/needs`} startIcon={<ArrowBackOutlined />} sx={{ minHeight: 44, mb: 1 }}>
        All needs
      </Button>
      <PageHeader title={need.title} subtitle={`${need.teamName} gear need`} />
      <Stack spacing={2}>
        <Alert severity="info">This is a demand request, not a reservation. Inventory remains available until a separate reservation is approved and allocated.</Alert>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Review status</Typography>
              <Chip label={need.status} />
            </Stack>
            {need.notes && <Typography variant="body2">{need.notes}</Typography>}
            <GearNeedActions leagueId={leagueId} needId={need.id} expectedVersion={need.version} status={need.status} canManageAll={context.canManageAll} />
          </Stack>
        </Card>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Requested items</Typography>
          <Stack divider={<Divider flexItem />}>
            {need.lines.map((line) => (
              <Stack key={line.id} direction="row" justifyContent="space-between" gap={2} py={1}>
                <Stack>
                  <Typography>{line.nameSnapshot}</Typography>
                  <Typography variant="body2" color="text.secondary">{[line.categorySnapshot, line.sizeSnapshot].filter(Boolean).join(" - ") || "Uncatalogued request"}</Typography>
                </Stack>
                <Typography>{line.fulfilledQty} / {line.requestedQty}</Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
