"use client";

import React from 'react';
import { Breadcrumbs, Typography, Link as MuiLink, Box, type SxProps, type Theme } from '@mui/material';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import Link from 'next/link';
import { useLeague } from '@/components/providers/LeagueProvider';

interface BreadcrumbNavProps {
  sx?: SxProps<Theme>;
}

const BreadcrumbNav = React.memo(function BreadcrumbNav({ sx }: BreadcrumbNavProps) {
  const { getBreadcrumbs } = useLeague();
  const breadcrumbs = getBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return null; // Don't show breadcrumbs for single items
  }

  return (
    <Box sx={{ py: 1, ...sx }}>
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        aria-label="breadcrumb navigation"
        sx={{
          '& .MuiBreadcrumbs-separator': {
            mx: 0.5,
          },
        }}
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (isLast || !crumb.href) {
            return (
              <Typography
                key={index}
                color="text.primary"
                variant="body2"
                sx={{ fontWeight: isLast ? 600 : 400 }}
              >
                {crumb.label}
              </Typography>
            );
          }

          return (
            <MuiLink
              key={index}
              component={Link}
              href={crumb.href}
              color="inherit"
              variant="body2"
              sx={{
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              {crumb.label}
            </MuiLink>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
});

export default BreadcrumbNav;