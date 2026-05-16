'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  AppBar,
  Toolbar,
  Container,
  Box,
  Button,
  Stack,
  Divider,
  useMediaQuery,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import Logo from '@/components/ui/Logo';
import CTAButton from '@/components/features/marketing/CTAButton';
import { marketingEvents } from '@/lib/analytics/tracking';

const navigationLinks = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
];

// Auth page pathnames
const AUTH_PATHNAMES = ['/login', '/signup'];

export default function MarketingHeader() {
  const theme = useTheme();
  const pathname = usePathname();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const isHomepage = pathname === '/';
  const isTransparent = isHomepage && !isScrolled;

  // Hide navbar completely on auth pages (they have their own logos)
  const isAuthPage = AUTH_PATHNAMES.includes(pathname);

  // Track scroll position to transition the homepage header from transparent to solid.
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Early return after all hooks
  if (isAuthPage) {
    return null;
  }

  const handleDrawerToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const isActiveHref = (href: string) => (
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
  );

  return (
    <>
      <AppBar
        component="header"
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: isTransparent ? 'transparent' : 'background.paper',
          borderBottom: isTransparent ? 0 : '2px solid',
          borderColor: 'rgba(13, 71, 161, 0.08)',
          backdropFilter: isTransparent ? 'none' : 'blur(12px)',
          backgroundColor: isTransparent ? 'transparent' : 'rgba(255, 255, 255, 0.95)',
          boxShadow: isTransparent ? 'none' : '0 4px 12px rgba(13, 71, 161, 0.08)',
          transition: 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{
            justifyContent: 'space-between',
            py: 1.5,
            minHeight: { xs: 64, md: 72 }
          }}
        >
          {/* Logo and Brand */}
          <Logo
            size="large"
            href="/"
            showText
            priority
            sx={{
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'scale(1.02)',
              },
            }}
          />

          {/* Desktop Navigation */}
          {!isMobile ? (
            <Stack
              component="nav"
              aria-label="Primary marketing navigation"
              direction="row"
              spacing={1}
              alignItems="center"
            >
              {navigationLinks.map((link) => (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  aria-current={isActiveHref(link.href) ? 'page' : undefined}
                  color="inherit"
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    px: 2.5,
                    py: 1,
                    minHeight: '40px',
                    borderRadius: 2,
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.08)',
                      color: 'primary.main',
                      transform: 'translateY(-2px)',
                    }
                  }}
                >
                  {link.label}
                </Button>
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24, alignSelf: 'center' }} />
              <Button
                component={Link}
                href="/login"
                color="inherit"
                onClick={() => marketingEvents.headerSignInClick()}
                sx={{
                  color: 'text.primary',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  px: 2.5,
                  py: 1,
                  minHeight: '40px',
                  borderRadius: 2,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    color: 'primary.main',
                    transform: 'translateY(-2px)',
                  }
                }}
              >
                Sign In
              </Button>
              <CTAButton
                href="/signup"
                variant="marketing"
                trackingAction="header_sign_up_click"
                trackingLabel="header"
                sx={{ ml: 1 }}
              >
                Get Started Free
              </CTAButton>
            </Stack>
          ) : (
            /* Mobile Navigation */
            <>
              <IconButton
                color="inherit"
                aria-label={mobileMenuOpen ? 'close navigation menu' : 'open navigation menu'}
                aria-controls="marketing-mobile-menu"
                aria-expanded={mobileMenuOpen}
                edge="end"
                onClick={handleDrawerToggle}
                sx={{
                  color: 'text.primary',
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.04)',
                  }
                }}
              >
                <MenuIcon />
              </IconButton>
              <Drawer
                anchor="right"
                open={mobileMenuOpen}
                onClose={handleDrawerToggle}
                slotProps={{
                  paper: {
                    id: 'marketing-mobile-menu',
                    role: 'dialog',
                    'aria-label': 'Marketing navigation menu',
                  },
                }}
                sx={{
                  '& .MuiDrawer-paper': {
                    width: 280,
                    pt: 2,
                  },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
                  <IconButton onClick={handleDrawerToggle} aria-label="close menu">
                    <CloseIcon />
                  </IconButton>
                </Box>
                <List component="nav" aria-label="Mobile marketing navigation" sx={{ px: 2 }}>
                  {navigationLinks.map((link) => (
                    <ListItem key={link.href} disablePadding sx={{ mb: 1 }}>
                      <ListItemButton
                        component={Link}
                        href={link.href}
                        aria-current={isActiveHref(link.href) ? 'page' : undefined}
                        onClick={handleDrawerToggle}
                        sx={{
                          borderRadius: 2,
                          '&:hover': {
                            backgroundColor: 'rgba(25, 118, 210, 0.04)',
                          }
                        }}
                      >
                        <ListItemText
                          primary={link.label}
                          primaryTypographyProps={{
                            fontWeight: 500,
                            color: 'text.primary'
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                  <Divider sx={{ my: 2 }} />
                  <ListItem disablePadding sx={{ mb: 1 }}>
                    <ListItemButton
                      component={Link}
                      href="/login"
                      onClick={() => {
                        marketingEvents.headerSignInClick();
                        handleDrawerToggle();
                      }}
                      sx={{
                        borderRadius: 2,
                        '&:hover': {
                          backgroundColor: 'rgba(25, 118, 210, 0.04)',
                        }
                      }}
                    >
                      <ListItemText
                        primary="Sign In"
                        primaryTypographyProps={{
                          fontWeight: 500,
                          color: 'text.primary'
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                  <ListItem>
                    <CTAButton
                      href="/signup"
                      variant="marketing"
                      trackingAction="header_sign_up_click"
                      trackingLabel="mobile_header"
                      fullWidth
                      onClick={handleDrawerToggle}
                    >
                      Get Started Free
                    </CTAButton>
                  </ListItem>
                </List>
              </Drawer>
            </>
          )}
        </Toolbar>
      </Container>
    </AppBar>
    </>
  );
}
