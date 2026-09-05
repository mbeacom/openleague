import { notFound } from "next/navigation";
import { Alert, Box, Card, CardContent } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { canBrandEntity } from "@/lib/actions/branding";
import { isBlobEnabled } from "@/lib/media/blob";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LogoUploader } from "@/components/ui/LogoUploader";

interface TeamSettingsPageProps {
  params: Promise<{ teamId: string }>;
}

/**
 * Per-team appearance settings. Separate from /settings, which only ever
 * addresses the single team a standalone account owns — this one is reachable
 * for any team the viewer administers, including inside a league.
 */
export default async function TeamBrandingPage({ params }: TeamSettingsPageProps) {
  const { teamId } = await params;
  const userId = await requireUserId();

  const team = await prisma.team.findFirst({
    where: { id: teamId, isActive: true },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandPrimaryColor: true,
    },
  });

  if (!team) notFound();

  const canBrand = await canBrandEntity(userId, "team", team.id);

  return (
    <PageContainer maxWidth="md">
      <LinkButton
        href={`/team/${team.id}`}
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 2 }}
      >
        Back to {team.name}
      </LinkButton>

      <PageHeader
        title="Team appearance"
        subtitle="Set the crest that identifies this team across schedules, rosters, and dashboards."
      />

      {!canBrand ? (
        <Alert severity="info">
          Only team admins can change this team&apos;s appearance.
        </Alert>
      ) : (
        <Box component="section">
          <SectionHeader title="Crest" />
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <LogoUploader
                entity="team"
                entityId={team.id}
                name={team.name}
                logoUrl={team.logoUrl}
                brandPrimaryColor={team.brandPrimaryColor}
                uploadsEnabled={isBlobEnabled()}
              />
            </CardContent>
          </Card>
        </Box>
      )}
    </PageContainer>
  );
}
