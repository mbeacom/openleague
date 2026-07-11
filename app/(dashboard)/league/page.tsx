import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  EmojiEvents as LeagueIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { requireUserId } from "@/lib/auth/session";
import { getViewerMemberships } from "@/lib/data/dashboard";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import LeagueOverviewCard from "@/components/features/dashboard/LeagueOverviewCard";
import CreateLeagueOnboardingForm from "@/components/features/onboarding/CreateLeagueOnboardingForm";

/**
 * League landing page (roadmap D1). Users without league memberships get the
 * join/create experience; users with leagues get their league list.
 */
export default async function LeaguePage() {
  const userId = await requireUserId();
  const { leagues } = await getViewerMemberships(userId);

  if (leagues.length === 0) {
    return (
      <PageContainer maxWidth="md">
        <PageHeader
          title="Leagues"
          subtitle="Organize multiple teams under one league with divisions and cross-team scheduling."
        />
        <EmptyState
          icon={<LeagueIcon />}
          title="You're not part of a league yet"
          description="Join one by accepting an invitation from a league administrator, or create your own below."
        />
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CreateLeagueOnboardingForm />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Leagues"
        subtitle="Leagues you belong to. Open one to manage teams, schedules, and rosters."
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
          },
          gap: 2,
        }}
      >
        {leagues.map((membership) => (
          <LeagueOverviewCard
            key={membership.league.id}
            league={membership.league}
            userRole={membership.role}
          />
        ))}
      </Box>

      <Accordion disableGutters sx={{ mt: 4 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AddIcon fontSize="small" color="primary" />
            <Typography variant="subtitle1">Create another league</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <CreateLeagueOnboardingForm />
          </Box>
        </AccordionDetails>
      </Accordion>
    </PageContainer>
  );
}
