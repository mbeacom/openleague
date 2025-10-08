'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import CloseIcon from '@mui/icons-material/Close';
import Logo from '@/components/ui/Logo';

const navigationLinks = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
];

export default function MarketingHeader() {
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
        backdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
            <Logo size="large" href={null} priority />
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                color: 'marketing.primary',
                letterSpacing: '-0.02em',
                display: { xs: 'none', sm: 'block' }
              }}
            >
              OpenLeague
            </Typography>
          </Box>

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
              <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24 }} />
              <Button 
                component={Link} 
                href="/login" 
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
                Sign In
              </Button>
              <Button 
                component={Link} 
                href="/signup" 
                variant="marketing"
                sx={{ ml: 1 }}
              >
                Get Started Free
              </Button>
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
                      onClick={handleDrawerToggle}
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
                  <ListItem disablePadding>
                    <Button
                      component={Link}
                      href="/signup"
                      variant="marketing"
                      fullWidth
                      onClick={handleDrawerToggle}
                      sx={{ mx: 2 }}
                    >
                      Get Started Free
                    </Button>
                  </ListItem>
                </List>
              </Drawer>
            </>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
}