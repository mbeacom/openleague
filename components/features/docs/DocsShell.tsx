"use client";

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box,
  Breadcrumbs,
  Container,
  Divider,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import {
  docsHome,
  docsSections,
  getDocsBreadcrumbs,
  normalizeDocsPath,
  searchDocs,
} from '@/lib/docs/config';

interface DocsShellProps {
  children: ReactNode;
  pathname?: string;
}

export default function DocsShell({ children, pathname }: DocsShellProps) {
  const currentPathname = usePathname();
  const activePath = normalizeDocsPath(pathname ?? currentPathname);
  const [query, setQuery] = useState('');

  const breadcrumbs = useMemo(() => getDocsBreadcrumbs(activePath), [activePath]);
  const searchResults = useMemo(() => searchDocs(query), [query]);

  return (
    <Container maxWidth="xl">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' },
          gap: { xs: 3, md: 5 },
          py: { xs: 3, md: 5 },
          mt: { xs: '64px', md: '72px' },
        }}
      >
        <Paper
          component="aside"
          elevation={0}
          variant="outlined"
          sx={{
            alignSelf: 'start',
            p: 2,
            position: { md: 'sticky' },
            top: { md: 96 },
          }}
        >
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Documentation
              </Typography>
              <MuiLink
                component={Link}
                href={docsHome.href}
                color={activePath === docsHome.href ? 'primary' : 'text.primary'}
                underline="hover"
                sx={{ display: 'block', fontWeight: 700, mt: 0.5 }}
              >
                {docsHome.title}
              </MuiLink>
            </Box>

            <TextField
              label="Search documentation"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              size="small"
              fullWidth
              inputProps={{ 'aria-label': 'Search documentation' }}
            />

            {query.trim() && (
              <Box aria-live="polite">
                <Typography variant="subtitle2" gutterBottom>
                  Search results
                </Typography>
                {searchResults.length > 0 ? (
                  <List dense disablePadding aria-label="Documentation search results">
                    {searchResults.map((result) => (
                      <ListItemButton key={result.href} component={Link} href={result.href}>
                        <ListItemText primary={result.title} secondary={result.description} />
                      </ListItemButton>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No documentation pages match your search.
                  </Typography>
                )}
              </Box>
            )}

            <Divider />

            <Box component="nav" aria-label="Documentation navigation">
              {docsSections.map((section) => (
                <Box key={section.title} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {section.title}
                  </Typography>
                  <List dense disablePadding>
                    {section.items.map((item) => (
                      <ListItemButton
                        key={item.href}
                        component={Link}
                        href={item.href}
                        selected={activePath === item.href}
                        sx={{ borderRadius: 1 }}
                      >
                        <ListItemText primary={item.title} secondary={item.description} />
                      </ListItemButton>
                    ))}
                  </List>
                </Box>
              ))}
            </Box>
          </Stack>
        </Paper>

        <Box component="main" id="main-content" tabIndex={-1} sx={{ minWidth: 0 }}>
          <Breadcrumbs
            aria-label="documentation breadcrumbs"
            separator={<NavigateNextIcon fontSize="small" />}
            sx={{ mb: 3 }}
          >
            {breadcrumbs.map((breadcrumb, index) => {
              const isLast = index === breadcrumbs.length - 1;

              if (isLast || !breadcrumb.href) {
                return (
                  <Typography key={`${breadcrumb.label}-${index}`} variant="body2" color="text.primary">
                    {breadcrumb.label}
                  </Typography>
                );
              }

              return (
                <MuiLink
                  key={breadcrumb.href}
                  component={Link}
                  href={breadcrumb.href}
                  variant="body2"
                  color="inherit"
                  underline="hover"
                >
                  {breadcrumb.label}
                </MuiLink>
              );
            })}
          </Breadcrumbs>

          {children}
        </Box>
      </Box>
    </Container>
  );
}
