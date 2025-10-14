'use client';

import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Stack,
  Divider,
  IconButton,
} from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import Logo from '@/components/ui/Logo';

const footerSections = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Get Started', href: '/get-started' },
      { label: 'Roadmap', href: '/docs/roadmap' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'User Guide', href: '/docs/user-guide' },
      { label: 'API Reference', href: '/docs/api' },
      { label: 'Guides', href: '/docs/guides' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'Security', href: '/security' },
    ],
  },
];

const socialLinks = [
  {
    icon: GitHubIcon,
    href: 'https://github.com/mbeacom/openleague',
    label: 'GitHub',
    color: '#333'
  },
  {
    icon: TwitterIcon,
    href: 'https://twitter.com/openleague',
    label: 'Twitter',
    color: '#1DA1F2'
  },
  {
    icon: LinkedInIcon,
    href: 'https://linkedin.com/company/openleague',
    label: 'LinkedIn',
    color: '#0077B5'
  },
];

export default function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        py: { xs: 6, md: 8 },
        mt: 'auto',
      }}
    >
      <Container maxWidth="lg">
        {/* Main Footer Content */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: '1fr 2fr',
            },
            gap: 4,
            mb: 6,
          }}
        >
          {/* Brand Section */}
          <Box>
            <Box sx={{ mb: 3 }}>
              <Logo
                size="medium"
                variant="footer"
                showText
                sx={{ mb: 2 }}
              />
              <Typography
                variant="marketingBody"
                color="text.secondary"
                sx={{ mb: 3, maxWidth: 300 }}
              >
                Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management.
              </Typography>

              {/* Social Links */}
              <Stack direction="row" spacing={1}>
                {socialLinks.map((social) => (
                  <IconButton
                    key={social.label}
                    component={Link}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': {
                        color: social.color,
                        backgroundColor: 'rgba(25, 118, 210, 0.04)',
                      },
                    }}
                  >
                    <social.icon />
                  </IconButton>
                ))}
              </Stack>
            </Box>
          </Box>

          {/* Footer Links */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(4, 1fr)',
              },
              gap: 4,
            }}
          >
            {footerSections.map((section) => (
              <Box key={section.title}>
                <Typography
                  component="h3"
                  variant="subtitle2"
                  gutterBottom
                  fontWeight={600}
                  color="text.primary"
                  sx={{ mb: 2 }}
                >
                  {section.title}
                </Typography>
                <Stack spacing={1.5}>
                  {section.links.map((link) => (
                    <Typography
                      key={link.href}
                      component={Link}
                      href={link.href}
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        textDecoration: 'none',
                        transition: 'color 0.2s ease-in-out',
                        '&:hover': {
                          color: 'marketing.primary',
                        },
                      }}
                    >
                      {link.label}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* Bottom Footer */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            © {currentYear} OpenLeague. All rights reserved. Made with ❤️ for sports teams everywhere.
          </Typography>

          <Stack
            direction="row"
            spacing={3}
            sx={{
              flexWrap: 'wrap',
              gap: { xs: 1, sm: 3 }
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              🌟 Free Forever
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              🔒 Privacy First
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              📱 Mobile Ready
            </Typography>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}