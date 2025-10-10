"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface DroppableDivisionProps {
  id: string;
  children: React.ReactNode;
  isEmpty?: boolean;
}

export function DroppableDivision({ id, children, isEmpty = false }: DroppableDivisionProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minHeight: isEmpty ? 120 : 'auto',
        borderRadius: 2,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        border: 2,
        borderStyle: 'dashed',
        borderColor: isOver ? 'primary.main' : 'transparent',
        bgcolor: isOver ? alpha('#1976d2', 0.08) : 'transparent',
        p: isOver || isEmpty ? 2 : 0,
        transform: isOver ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isOver ? `0 0 0 3px ${alpha('#1976d2', 0.1)}, inset 0 0 20px ${alpha('#1976d2', 0.05)}` : 'none',
        '&::before': isOver ? {
          content: '\"\"',
          position: 'absolute',
          inset: -4,
          borderRadius: 2,
          background: `linear-gradient(45deg, ${alpha('#1976d2', 0.2)}, ${alpha('#1976d2', 0.1)}, ${alpha('#1976d2', 0.2)})`,
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 2s ease infinite',
          pointerEvents: 'none',
          zIndex: -1,
        } : {},
        '@keyframes gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      }}
    >
      {children}
    </Box>
  );
}
