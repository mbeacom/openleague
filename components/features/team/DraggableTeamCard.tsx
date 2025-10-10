"use client";

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Draggable } from '@hello-pangea/dnd';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Team } from '@prisma/client';
import { DragIndicator as DragIcon } from '@mui/icons-material';

interface DraggableTeamCardProps {
  id: string;
  children: React.ReactNode;
}

export function DraggableTeamCard({ id, children }: DraggableTeamCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    transition: 'opacity 0.2s ease-in-out',
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        position: 'relative',
        transform: isDragging ? 'scale(1.05) rotate(2deg)' : 'scale(1)',
        boxShadow: isDragging ? 8 : 0,
        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease-in-out',
        '&:hover .drag-handle': {
          opacity: 1,
        },
      }}
    >
      <Box
        {...listeners}
        {...attributes}
        className="drag-handle"
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 1,
          opacity: 0,
          transition: 'opacity 0.2s ease-in-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease',
          cursor: 'grab',
          bgcolor: alpha('#000', 0.04),
          borderRadius: 1,
          p: 0.5,
          display: 'flex',
          alignItems: 'center',
          '&:hover': {
            bgcolor: alpha('#000', 0.08),
            transform: 'scale(1.1)',
          },
          '&:active': {
            cursor: 'grabbing',
            transform: 'scale(0.95)',
          },
        }}
      >
        <DragIcon fontSize="small" color="action" />
      </Box>
      {children}
    </Box>
  );
}
