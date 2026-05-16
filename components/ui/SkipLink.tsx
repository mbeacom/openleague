'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';

interface SkipLinkProps {
  href?: string;
  children?: ReactNode;
}

export default function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
}: SkipLinkProps) {
  return (
    <Box
      component="a"
      href={href}
      sx={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: (theme) => theme.zIndex.tooltip + 1,
        px: 2,
        py: 1.25,
        borderRadius: 2,
        bgcolor: 'background.paper',
        color: 'primary.main',
        boxShadow: 3,
        fontWeight: 800,
        outline: '2px solid',
        outlineColor: 'primary.main',
        outlineOffset: 2,
        textDecoration: 'none',
        transform: 'translateY(-180%)',
        transition: 'transform 0.18s ease-out',
        '&:focus, &:focus-visible': {
          transform: 'translateY(0)',
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      }}
    >
      {children}
    </Box>
  );
}