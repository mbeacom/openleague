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

export default function MarketingHeader() {
  const theme = useTheme();
  const pathname = usePathname();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Only hide navbar initially on homepage
  const isHomepage = pathname === '/';

  // Hide navbar completely on auth pages (they have their own logos)
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Track scroll position to show/hide navbar
  useEffect(() => {
    const handleScroll = () => {
      // Show navbar after scrolling down 100px (only matters on homepage)
      setIsScrolled(window.scrollY > 100);
    };

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

  return (
    <>
      <AppBar
        position="fixed"
        elevation={isScrolled ? 2 : 0}
        sx={{
          bgcolor: isScrolled ? 'background.paper' : 'transparent',
          borderBottom: isScrolled ? 1 : 0,
          borderColor: 'divider',
          backdropFilter: isScrolled ? 'blur(8px)' : 'none',
          backgroundColor: isScrolled ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
          // Only hide navbar on homepage initially, show on all other pages
          transform: isHomepage && !isScrolled ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 0.3s ease-in-out, background-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
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
            <Stack direction="row" spacing={1} alignItems="center">
              {navigationLinks.map((link) => (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  color="inherit"
                  sx={{
                    color: 'text.primary',
                    fontWeight: 500,
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.04)',
                      color: 'marketing.primary',
                    }
                  }}
                >
                  {link.label}
                </Button>
              ))}
              <Button
                component={Link}
                href="/login"
                color="inherit"
                onClick={() => marketingEvents.headerSignInClick()}
                sx={{
                  color: 'text.primary',
                  fontWeight: 500,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.04)',
                    color: 'marketing.primary',
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
                aria-label="open menu"
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
                sx={{
                  '& .MuiDrawer-paper': {
                    width: 280,
                    pt: 2,
                  },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
                  <IconButton onClick={handleDrawerToggle}>
                    <CloseIcon />
                  </IconButton>
                </Box>
                <List sx={{ px: 2 }}>
                  {navigationLinks.map((link) => (
                    <ListItem key={link.href} disablePadding sx={{ mb: 1 }}>
                      <ListItemButton
                        component={Link}
                        href={link.href}
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

    {/* Floating menu button for mobile - only visible on homepage when navbar is hidden */}
    {isMobile && isHomepage && !isScrolled && (
      <IconButton
        onClick={handleDrawerToggle}
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1100,
          bgcolor: 'background.paper',
          boxShadow: 2,
          '&:hover': {
            bgcolor: 'background.paper',
            boxShadow: 4,
          },
        }}
        aria-label="open menu"
      >
        <MenuIcon />
      </IconButton>
    )}
    </>
  );
}