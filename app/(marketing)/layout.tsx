'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AppBar,
  Toolbar,
  Container,
  Box,
  Button,
  Typography,
  Stack,
  Divider,
  useTheme,
  useMediaQuery,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import './marketing.css';

interface MarketingLayoutProps {
  children: ReactNode;
}

const navigationLinks = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
];

function MarketingHeader() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 1.5 }}>
          <Box
            component={Link}
            href="/"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              textDecoration: 'none',
              color: 'inherit',
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'scale(1.02)',
              },
            }}
          >
            <Image
              src="/images/logo.webp"
              alt="OpenLeague Logo"
              width={48}
              height={48}
              priority
            />
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                color: 'primary.main',
                letterSpacing: '-0.02em',
              }}
            >
              OpenLeague
            </Typography>
          </Box>

          {isMobile ? (
            <>
              <IconButton
                color="inherit"
                aria-label="open menu"
                edge="end"
                onClick={handleDrawerToggle}
                sx={{ color: 'text.primary' }}
              >
                <MenuIcon />
              </IconButton>
              <Drawer
                anchor="right"
                open={mobileMenuOpen}
                onClose={handleDrawerToggle}
                sx={{
                  '& .MuiDrawer-paper': { width: 240 },
                }}
              >
                <List>
                  {navigationLinks.map((link) => (
                    <ListItem key={link.href} disablePadding>
                      <ListItemButton
                        component={Link}
                        href={link.href}
                        onClick={handleDrawerToggle}
                      >
                        <ListItemText primary={link.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                  <Divider sx={{ my: 1 }} />
                  <ListItem disablePadding>
                    <ListItemButton component={Link} href="/login" onClick={handleDrawerToggle}>
                      <ListItemText primary="Sign In" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton component={Link} href="/signup" onClick={handleDrawerToggle}>
                      <ListItemText primary="Get Started" />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Drawer>
            </>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              {navigationLinks.map((link) => (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  color="inherit"
                  sx={{ color: 'text.primary' }}
                >
                  {link.label}
                </Button>
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <Button component={Link} href="/login" color="inherit" sx={{ color: 'text.primary' }}>
                Sign In
              </Button>
              <Button component={Link} href="/signup" variant="contained">
                Get Started
              </Button>
            </Stack>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
}

function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        py: 6,
        mt: 8,
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: 4,
            mb: 4,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Image
                src="/images/logo.webp"
                alt="OpenLeague Logo"
                width={32}
                height={32}
              />
              <Typography variant="h6" fontWeight={700} color="primary">
                OpenLeague
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Affordable sports team management with transparent pricing. No hidden fees.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Product
            </Typography>
            <Stack spacing={1}>
              <Link href="/features" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Features
                </Typography>
              </Link>
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Pricing
                </Typography>
              </Link>
              <Link href="/get-started" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Get Started
                </Typography>
              </Link>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Resources
            </Typography>
            <Stack spacing={1}>
              <Link href="/docs" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Documentation
                </Typography>
              </Link>
              <Link href="/docs/guides" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Guides
                </Typography>
              </Link>
              <Link href="/docs/api" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  API Reference
                </Typography>
              </Link>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Company
            </Typography>
            <Stack spacing={1}>
              <Link href="/about" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  About
                </Typography>
              </Link>
              <Link href="/contact" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  Contact
                </Typography>
              </Link>
              <Link href="https://github.com/mbeacom/openleague" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                  GitHub
                </Typography>
              </Link>
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            © {currentYear} OpenLeague. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Link href="/privacy" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                Privacy Policy
              </Typography>
            </Link>
            <Link href="/terms" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
                Terms of Service
              </Typography>
            </Link>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <Box className="marketing-layout" sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <MarketingHeader />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      <MarketingFooter />
    </Box>
  );
}