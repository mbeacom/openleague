import React from 'react';
import { Container, Typography, Box, Card, CardContent, Button, Stack, Chip } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import Link from 'next/link';
import { PRICING_PLANS, COMPARISON_POINTS } from '@/lib/config/pricing';
import { generatePageMetadata, getBreadcrumbSchema, getFAQSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Pricing',
  description: 'OpenLeague early access pricing. Sign up now during our beta period. Flexible pricing plans coming soon - contact us for details.',
  path: '/pricing',
  keywords: ['pricing', 'free team management', 'affordable sports software', 'team management cost', 'early access'],
});

export default function PricingPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Pricing', url: '/pricing' },
  ]);

  const faqSchema = getFAQSchema([
    {
      question: 'Is OpenLeague free?',
      answer: "OpenLeague is currently in early access beta with flexible pricing. We'll work with you to find the right plan for your team.",
    },
    {
      question: 'Can I sign up now?',
      answer: "Yes! You can sign up for early access today. We'll be in touch to discuss pricing options tailored to your needs.",
    },
    {
      question: 'Will pricing change after launch?',
      answer: 'Pricing may be adjusted as we refine our plans, but early adopters will receive favorable rates. We value your feedback during beta.',
    },
  ]);

  return (
    <>
      <StructuredData data={[breadcrumbSchema, faqSchema]} />
      <Container maxWidth="lg">
        <Box sx={{ 
          py: 4,
          px: 3,
          bgcolor: 'info.lighter',
          borderRadius: 2,
          mb: 4,
          mt: 4,
          textAlign: 'center',
          border: '1px solid',
          borderColor: 'info.light',
        }}>
          <Typography variant="h6" sx={{ color: 'info.main', fontWeight: 600 }}>
            🚀 Early Access Beta
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            OpenLeague is currently in beta. Pricing is flexible and will be tailored to your team's needs. Sign up today and let's talk about the right plan for you.
          </Typography>
        </Box>

        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom textAlign="center">
            Simple, Flexible Pricing
          </Typography>
          <Typography variant="h5" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
            Early access pricing tailored to your needs
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 8 }}>
            We're currently in beta and finalizing our pricing plans. Sign up now to get early access, and we'll be in touch about your plan options.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 8, pt: 3 }}>
            <Card>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h4" component="h2" gutterBottom>
                  {PRICING_PLANS.starter.name}
                </Typography>
                <Box sx={{ my: 3 }}>
                  <Typography variant="h3" component="div" color="primary.main">
                    {PRICING_PLANS.starter.price}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    early access
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
                  {PRICING_PLANS.starter.features.map((feature) => (
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
                overflow: 'visible',
              }}
            >
              {PRICING_PLANS.pro.highlightLabel && (
                <Chip
                  label={PRICING_PLANS.pro.highlightLabel}
                  color="primary"
                  sx={{
                    position: 'absolute',
                    top: -16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontWeight: 600,
                    zIndex: 1,
                  }}
                />
              )}
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h4" component="h2" gutterBottom>
                  {PRICING_PLANS.pro.name}
                </Typography>
                <Box sx={{ my: 3 }}>
                  <Typography variant="h3" component="div" color="primary.main">
                    {PRICING_PLANS.pro.price}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    early access
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
                  {PRICING_PLANS.pro.features.map((feature) => (
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

                  {COMPARISON_POINTS.map((point) => (
                    <React.Fragment key={point.feature}>
                      <Typography variant="body2">{point.feature}</Typography>
                      <Typography
                        variant="body2"
                        fontWeight={point.feature.startsWith('OpenLeague') ? 600 : 400}
                        color={point.feature.startsWith('OpenLeague') ? 'success.main' : 'text.primary'}
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
              Get Started
            </Button>
          </Box>
        </Box>
      </Container>
    </>
  );
}