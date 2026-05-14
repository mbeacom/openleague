'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
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
import GitHubIcon from '@mui/icons-material/GitHub';
import GroupsIcon from '@mui/icons-material/Groups';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

const testimonials = [
  {
    quote:
      'OpenLeague is built around the way volunteer coaches actually work: quick roster updates, fast RSVPs, and one place to check before practice.',
    name: 'Youth hockey coach',
    role: 'Representative feedback',
    initials: 'YC',
  },
  {
    quote:
      'The mobile-first layout makes it easy to answer the only question parents keep asking: where are we supposed to be and who is coming?',
    name: 'Team manager',
    role: 'Representative feedback',
    initials: 'TM',
  },
  {
    quote:
      'A public roadmap and open-source codebase make it easier for clubs to trust the platform and shape what gets built next.',
    name: 'Club organizer',
    role: 'Community preview',
    initials: 'CO',
  },
];

const statistics = [
  {
    id: 'open-source',
    value: 100,
    suffix: '%',
    label: 'Open-source core',
    description: 'Public code, public roadmap, and transparent project direction.',
    icon: <GitHubIcon fontSize="large" />,
  },
  {
    id: 'workflows',
    value: 4,
    suffix: '',
    label: 'Core workflows',
    description: 'Rosters, schedules, RSVPs, and team communication in one hub.',
    icon: <GroupsIcon fontSize="large" />,
  },
  {
    id: 'touch-target',
    value: 44,
    suffix: 'px',
    label: 'Mobile touch targets',
    description: 'Designed for rink-side, sideline, and parking-lot updates.',
    icon: <PhoneIphoneIcon fontSize="large" />,
  },
  {
    id: 'setup',
    value: 3,
    suffix: '',
    label: 'Setup steps',
    description: 'Create an account, set up a team, and invite your roster.',
    icon: <EventAvailableIcon fontSize="large" />,
  },
];

const trustSignals = [
  'Public GitHub repository',
  'Community-shaped roadmap',
  'No credit card required',
  'Mobile-first design',
];

type Testimonial = (typeof testimonials)[number];

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Card
      variant="marketing"
      role="article"
      aria-label={`${testimonial.name} testimonial`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent
        sx={{
          p: 4,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.8, flexGrow: 1 }}
        >
          “{testimonial.quote}”
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontWeight: 800,
            }}
          >
            {testimonial.initials}
          </Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {testimonial.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {testimonial.role}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AnimatedCounter({
  value,
  suffix = '',
  duration = 900,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      const timer = window.setTimeout(() => setDisplayValue(value), 0);
      return () => window.clearTimeout(timer);
    }

    const steps = Math.min(Math.abs(value), 24) || 1;
    let currentStep = 0;
    const timer = window.setInterval(() => {
      currentStep += 1;

      if (currentStep >= steps) {
        setDisplayValue(value);
        window.clearInterval(timer);
        return;
      }

      setDisplayValue(Math.round((value / steps) * currentStep));
    }, duration / steps);

    return () => window.clearInterval(timer);
  }, [duration, value]);

  return (
    <>
      {displayValue.toLocaleString()}
      {suffix}
    </>
  );
}

export default function SocialProofSection() {
  return (
    <Box
      component="section"
      aria-labelledby="social-proof-heading"
      sx={(theme) => ({
        py: { xs: 10, md: 14 },
        bgcolor: 'background.paper',
        backgroundImage: `linear-gradient(180deg, ${alpha(theme.palette.primary.light, 0.04)} 0%, ${alpha(theme.palette.background.default, 0.85)} 100%)`,
      })}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <Typography
            id="social-proof-heading"
            variant="sectionTitle"
            component="h2"
            sx={{ mb: 3, color: 'text.primary' }}
          >
            Trusted by the People Who Keep Teams Moving
          </Typography>
          <Typography
            variant="marketingBody"
            sx={{
              color: 'text.secondary',
              maxWidth: 760,
              mx: 'auto',
            }}
          >
            Representative feedback, transparent community signals, and practical credibility
            markers for coaches, managers, and clubs evaluating OpenLeague.
          </Typography>
        </Box>

        <Grid container spacing={4} sx={{ mb: 8 }}>
          {testimonials.map((testimonial) => (
            <Grid size={{ xs: 12, md: 4 }} key={testimonial.name}>
              <TestimonialCard testimonial={testimonial} />
            </Grid>
          ))}
        </Grid>

        <Card
          variant="outlined"
          sx={{
            borderColor: 'primary.light',
            borderRadius: 4,
            overflow: 'hidden',
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.92),
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={4}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={3}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', md: 'center' }}
              >
                <Box>
                  <Typography variant="featureTitle" component="h3" sx={{ mb: 1 }}>
                    Credibility You Can Verify
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Static, build-safe indicators highlight what is already true without relying
                    on external API calls during page rendering.
                  </Typography>
                </Box>
                <Chip
                  icon={<VerifiedUserIcon />}
                  label="Open community project"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Stack>

              <Grid container spacing={3}>
                {statistics.map((stat) => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={stat.id}>
                    <Box
                      data-testid={`stat-${stat.id}`}
                      sx={{
                        height: '100%',
                        p: 3,
                        borderRadius: 3,
                        bgcolor: 'background.default',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ color: 'primary.main', mb: 2 }}>{stat.icon}</Box>
                      <Typography
                        variant="h3"
                        component="p"
                        fontWeight={900}
                        color="primary.main"
                        sx={{ mb: 1, letterSpacing: '-0.03em' }}
                      >
                        <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                      </Typography>
                      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
                        {stat.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {stat.description}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                useFlexGap
                flexWrap="wrap"
                alignItems={{ xs: 'stretch', sm: 'center' }}
              >
                {trustSignals.map((signal) => (
                  <Chip
                    key={signal}
                    label={signal}
                    variant="outlined"
                    sx={{
                      justifyContent: 'center',
                      fontWeight: 700,
                      py: 2.25,
                    }}
                  />
                ))}
                <Typography
                  component="a"
                  href="https://github.com/mbeacom/openleague"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    color: 'primary.main',
                    fontWeight: 800,
                    textDecoration: 'none',
                    px: 1,
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  <GitHubIcon fontSize="small" />
                  View OpenLeague on GitHub
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
