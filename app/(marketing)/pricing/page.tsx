import React from 'react';
import { Metadata } from 'next';
import { Container, Typography, Box, Card, CardContent, Button, Stack, Chip } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing - OpenLeague',
  description: 'Transparent, affordable pricing for sports team management. Simple plans that scale with your needs.',
};

const starterFeatures = [
  'Up to 25 team members',
  'Unlimited events and games',
  'RSVP tracking',
  'Email notifications',
  'Mobile app access',
  'Basic roster management',
  'Community support',
];

const proFeatures = [
  'Everything in Starter',
  'Unlimited team members',
  'League management',
  'Division organization',
  'Advanced communication tools',
  'Multiple teams',
  'Priority email support',
  'Custom branding (coming soon)',
];

const comparisonPoints = [
  { feature: 'OpenLeague Starter', price: '$5/mo', limit: 'Up to 25 members' },
  { feature: 'OpenLeague Pro', price: '$15/mo', limit: 'Unlimited' },
  { feature: 'TeamSnap', price: '$13.99/mo', limit: 'Per team, limited' },
  { feature: 'SportsEngine', price: '$19.99/mo', limit: 'Per team' },
  { feature: 'Spreadsheets', price: 'Free', limit: 'Manual & error-prone' },
];

export default function PricingPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom textAlign="center">
          Simple, Transparent Pricing
        </Typography>
        <Typography variant="h5" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
          Affordable plans that scale with your team.
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 8 }}>
          Start with our Starter plan, upgrade as you grow. No hidden fees or surprise charges.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 8 }}>
          <Card>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h4" component="h2" gutterBottom>
                Starter
              </Typography>
              <Box sx={{ my: 3 }}>
                <Typography variant="h3" component="div" color="primary.main">
                  $5
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  per month
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/signup"
                variant="outlined"
                size="large"
                fullWidth
                sx={{ mb: 4 }}
              >
                Get Started
              </Button>

              <Stack spacing={2} sx={{ textAlign: 'left' }}>
                {starterFeatures.map((feature) => (
                  <Box key={feature} sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckIcon sx={{ color: 'success.main', mr: 2, flexShrink: 0 }} />
                    <Typography variant="body2">{feature}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card
            sx={{
              border: 2,
              borderColor: 'primary.main',
              position: 'relative',
            }}
          >
            <Chip
              label="Most Popular"
              color="primary"
              sx={{
                position: 'absolute',
                top: -16,
                left: '50%',
                transform: 'translateX(-50%)',
                fontWeight: 600,
              }}
            />
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h4" component="h2" gutterBottom>
                Pro
              </Typography>
              <Box sx={{ my: 3 }}>
                <Typography variant="h3" component="div" color="primary.main">
                  $15
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  per month
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/signup"
                variant="contained"
                size="large"
                fullWidth
                sx={{ mb: 4 }}
              >
                Get Started
              </Button>

              <Stack spacing={2} sx={{ textAlign: 'left' }}>
                {proFeatures.map((feature) => (
                  <Box key={feature} sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckIcon sx={{ color: 'success.main', mr: 2, flexShrink: 0 }} />
                    <Typography variant="body2">{feature}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" component="h2" gutterBottom textAlign="center">
            How We Compare
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
            See how OpenLeague stacks up against other team management solutions.
          </Typography>

          <Card>
            <CardContent>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                  gap: 2,
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  Solution
                </Typography>
                <Typography variant="subtitle2" fontWeight={600}>
                  Monthly Cost
                </Typography>
                <Typography variant="subtitle2" fontWeight={600}>
                  Limitations
                </Typography>

                {comparisonPoints.map((point) => (
                  <React.Fragment key={point.feature}>
                    <Typography variant="body2">{point.feature}</Typography>
                    <Typography
                      variant="body2"
                      fontWeight={point.feature === 'OpenLeague' ? 600 : 400}
                      color={point.feature === 'OpenLeague' ? 'success.main' : 'text.primary'}
                    >
                      {point.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {point.limit}
                    </Typography>
                  </React.Fragment>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" component="h2" gutterBottom textAlign="center">
            Why OpenLeague?
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gap: 3,
              mt: 4,
            }}
          >
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Transparent Pricing
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  No hidden fees, no surprise charges. What you see is what you pay.
                  Simple monthly pricing that scales with your needs.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Open Source
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  OpenLeague is open-source software (BSL 1.1). The source code is available,
                  and we welcome community contributions.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Built for Teams
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  We focus on delivering value and great user experience.
                  No expensive sales teams or aggressive upselling.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Box sx={{ textAlign: 'center', p: 4, bgcolor: 'background.paper', borderRadius: 2 }}>
          <Typography variant="h5" gutterBottom>
            Ready to Get Started?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Join teams already using OpenLeague to simplify their management. Start with Starter, upgrade anytime.
          </Typography>
          <Button component={Link} href="/signup" variant="contained" size="large">
            Start Your 14-Day Free Trial
          </Button>
        </Box>
      </Box>
    </Container>
  );
}