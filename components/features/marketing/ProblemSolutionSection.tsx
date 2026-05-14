'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

const comparisons = [
  {
    problem: 'Roster details scattered across spreadsheets, emails, and text threads.',
    solution: 'One secure roster keeps player, guardian, and staff details organized.',
  },
  {
    problem: 'Coaches guess attendance from half-answered group chats before every event.',
    solution: 'Live RSVP status shows who is going, maybe, or out at a glance.',
  },
  {
    problem: 'Last-minute changes get buried and families miss the latest update.',
    solution: 'Targeted reminders and event updates keep the right people informed.',
  },
];

export default function ProblemSolutionSection() {
  return (
    <Box
      component="section"
      aria-labelledby="problem-solution-heading"
      sx={(theme) => ({
        py: { xs: 10, md: 14 },
        bgcolor: 'background.paper',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 20% 20%, ${alpha(theme.palette.primary.light, 0.12)} 0%, transparent 32%), radial-gradient(circle at 80% 10%, ${alpha(theme.palette.success.main, 0.1)} 0%, transparent 28%)`,
          pointerEvents: 'none',
        },
      })}
    >
      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        <Stack spacing={3} alignItems="center" textAlign="center" sx={{ mb: 8 }}>
          <Chip
            icon={<CompareArrowsIcon />}
            label="Problem → Solution"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Typography id="problem-solution-heading" variant="sectionTitle" component="h2">
            Trade Team-Management Chaos for One Clear Playbook
          </Typography>
          <Typography variant="marketingBody" color="text.secondary" sx={{ maxWidth: 760 }}>
            OpenLeague turns the everyday admin grind into a simple workflow your whole team can follow.
          </Typography>
        </Stack>

        <Grid container spacing={4} alignItems="stretch">
          <Grid size={{ xs: 12, md: 5 }}>
            <Card
              component="section"
              aria-labelledby="team-management-chaos-heading"
              sx={(theme) => ({
                height: '100%',
                border: `1px solid ${alpha(theme.palette.error.main, 0.22)}`,
                bgcolor: alpha(theme.palette.error.light, 0.06),
              })}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                  <WarningAmberIcon color="error" />
                  <Typography id="team-management-chaos-heading" variant="h5" component="h3">
                    The usual team-management chaos
                  </Typography>
                </Stack>
                <Stack spacing={2.5}>
                  {comparisons.map((item) => (
                    <Box
                      key={item.problem}
                      sx={(theme) => ({
                        p: 2,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.background.paper, 0.78),
                        boxShadow: `inset 4px 0 0 ${theme.palette.error.main}`,
                      })}
                    >
                      <Typography variant="body1" color="text.secondary">
                        {item.problem}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 2 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box
              aria-hidden="true"
              sx={(theme) => ({
                width: { xs: 56, md: 72 },
                height: { xs: 56, md: 72 },
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                color: 'primary.contrastText',
                bgcolor: 'primary.main',
                boxShadow: `0 16px 32px ${alpha(theme.palette.primary.main, 0.28)}`,
                animation: 'pulseArrow 2.4s ease-in-out infinite',
                '@keyframes pulseArrow': {
                  '0%, 100%': { transform: 'scale(1)' },
                  '50%': { transform: 'scale(1.08)' },
                },
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                },
              })}
            >
              <CompareArrowsIcon fontSize="large" />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card
              component="section"
              aria-labelledby="openleague-playbook-heading"
              sx={(theme) => ({
                height: '100%',
                border: `1px solid ${alpha(theme.palette.success.main, 0.24)}`,
                bgcolor: alpha(theme.palette.success.light, 0.08),
              })}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                  <TaskAltIcon color="success" />
                  <Typography id="openleague-playbook-heading" variant="h5" component="h3">
                    The OpenLeague playbook
                  </Typography>
                </Stack>
                <Stack spacing={2.5}>
                  {comparisons.map((item) => (
                    <Box
                      key={item.solution}
                      sx={(theme) => ({
                        p: 2,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.background.paper, 0.86),
                        boxShadow: `inset 4px 0 0 ${theme.palette.success.main}`,
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        '&:hover': {
                          transform: 'translateX(4px)',
                          boxShadow: `inset 4px 0 0 ${theme.palette.success.main}, 0 10px 24px ${alpha(theme.palette.success.main, 0.12)}`,
                        },
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'none',
                          '&:hover': { transform: 'none' },
                        },
                      })}
                    >
                      <Typography variant="body1" color="text.primary" fontWeight={600}>
                        {item.solution}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
