"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Chip,
} from "@mui/material";
import {
  SportsHockey as HockeyIcon,
  Groups as TeamsIcon,
  EmojiEvents as LeagueIcon,
} from "@mui/icons-material";
import CreateTeamForm from "@/components/features/team/CreateTeamForm";
import CreateLeagueOnboardingForm from "@/components/features/onboarding/CreateLeagueOnboardingForm";

type Intent = "team" | "league" | null;

export default function OnboardingFlow() {
  const [intent, setIntent] = useState<Intent>(null);

  if (intent === "team") {
    return (
      <OnboardingShell onBack={() => setIntent(null)}>
        <CreateTeamForm />
      </OnboardingShell>
    );
  }

  if (intent === "league") {
    return (
      <OnboardingShell onBack={() => setIntent(null)}>
        <CreateLeagueOnboardingForm />
      </OnboardingShell>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
        px: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: "center", mb: 5 }}>
        <HockeyIcon
          sx={{ fontSize: 48, color: "primary.main", mb: 1.5 }}
        />
        <Typography
          variant="h4"
          component="h1"
          fontWeight={700}
          gutterBottom
          sx={{ letterSpacing: "-0.5px" }}
        >
          Welcome to OpenLeague
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 480, mx: "auto" }}
        >
          Tell us how you&apos;re using OpenLeague. We&apos;ll get you set up in seconds.
        </Typography>
      </Box>

      {/* Intent cards */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2.5}
        sx={{ width: "100%", maxWidth: 640 }}
      >
        <IntentCard
          icon={<TeamsIcon sx={{ fontSize: 36 }} />}
          title="I manage a team"
          description="Create a single team — manage your roster, schedule games & practices, and track RSVPs."
          badge="Most common"
          onClick={() => setIntent("team")}
        />
        <IntentCard
          icon={<LeagueIcon sx={{ fontSize: 36 }} />}
          title="I run a league or association"
          description="Organize multiple teams under one league, manage divisions, and schedule games across teams."
          onClick={() => setIntent("league")}
        />
      </Stack>

      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ mt: 4 }}
      >
        You can create additional teams and leagues from your dashboard at any time.
      </Typography>
    </Box>
  );
}

function IntentCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        flex: 1,
        transition: "all 0.18s ease",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: (theme: any) => `0 0 0 2px ${theme.palette.primary.light}`,
        },
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{ height: "100%", p: 0.5 }}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Box sx={{ color: "primary.main" }}>{icon}</Box>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {title}
                </Typography>
                {badge && (
                  <Chip
                    label={badge}
                    size="small"
                    color="primary"
                    sx={{ fontSize: "0.65rem", height: 20 }}
                  />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function OnboardingShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <Box
      sx={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
        px: 2,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 520 }}>
        <Button
          onClick={onBack}
          variant="text"
          sx={{
            color: "text.secondary",
            fontSize: "0.875rem",
            mb: 3,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            p: 0,
            textTransform: "none",
            "&:hover": { color: "text.primary", backgroundColor: "transparent" },
          }}
        >
          ← Back
        </Button>
        {children}
      </Box>
    </Box>
  );
}
