"use client";

import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Box, Typography, Card, CardContent, Avatar, alpha } from '@mui/material';
import { Groups as TeamsIcon, DragIndicator as DragIcon } from '@mui/icons-material';
import { assignTeamToDivision } from '@/lib/actions/league';
import { useRouter } from 'next/navigation';

interface Team {
  id: string;
  name: string;
  sport: string;
  season: string;
  createdAt: Date;
  _count: {
    players: number;
    events: number;
  };
}

interface Division {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
  teams: Team[];
}

interface DragDropTeamsProps {
  leagueId: string;
  divisions: Division[];
  unassignedTeams: Team[];
  children: (props: {
    divisions: Division[];
    unassignedTeams: Team[];
    activeTeam: Team | null;
  }) => React.ReactNode;
}

export default function DragDropTeams({
  leagueId,
  divisions: initialDivisions,
  unassignedTeams: initialUnassigned,
  children,
}: DragDropTeamsProps) {
  const router = useRouter();
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [divisions, setDivisions] = useState(initialDivisions);
  const [unassignedTeams, setUnassignedTeams] = useState(initialUnassigned);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    // Find the team being dragged
    const team = findTeamById(active.id as string);
    setActiveTeam(team);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTeam(null);

    if (!over || active.id === over.id) {
      return;
    }

    const teamId = active.id as string;
    const targetDivisionId = over.id === 'unassigned' ? null : (over.id as string);

    // Optimistic update
    updateTeamDivisionLocally(teamId, targetDivisionId);

    // Perform server update
    try {
      const result = await assignTeamToDivision({
        leagueId,
        teamId,
        divisionId: targetDivisionId,
      });

      if (!result.success) {
        // Revert on error
        setDivisions(initialDivisions);
        setUnassignedTeams(initialUnassigned);
        console.error('Failed to update team division:', result.error);
      } else {
        // Refresh to ensure data consistency
        router.refresh();
      }
    } catch (error) {
      // Revert on error
      setDivisions(initialDivisions);
      setUnassignedTeams(initialUnassigned);
      console.error('Error updating team division:', error);
    }
  };

  const findTeamById = (teamId: string): Team | null => {
    // Check divisions
    for (const division of divisions) {
      const team = division.teams.find(t => t.id === teamId);
      if (team) return team;
    }
    // Check unassigned
    return unassignedTeams.find(t => t.id === teamId) || null;
  };

  const updateTeamDivisionLocally = (teamId: string, newDivisionId: string | null) => {
    const team = findTeamById(teamId);
    if (!team) return;

    // Remove team from current location
    const newDivisions = divisions.map(division => ({
      ...division,
      teams: division.teams.filter(t => t.id !== teamId),
    }));
    const newUnassigned = unassignedTeams.filter(t => t.id !== teamId);

    // Add team to new location
    if (newDivisionId === null) {
      newUnassigned.push(team);
    } else {
      const targetDivision = newDivisions.find(d => d.id === newDivisionId);
      if (targetDivision) {
        targetDivision.teams.push(team);
      }
    }

    setDivisions(newDivisions);
    setUnassignedTeams(newUnassigned);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children({ divisions, unassignedTeams, activeTeam })}

      <DragOverlay dropAnimation={{
        duration: 300,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeTeam ? (
          <Card
            sx={{
              opacity: 0.95,
              cursor: 'grabbing',
              transform: 'rotate(5deg) scale(1.05)',
              boxShadow: '0 12px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                transform: 'rotate(5deg) scale(1.08)',
              },
            }}
          >
            <CardContent sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2, 
              py: 2,
              bgcolor: alpha('#fff', 0.98),
            }}>
              <DragIcon 
                color="action" 
                sx={{ 
                  animation: 'pulse 1.5s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 0.6 },
                    '50%': { opacity: 1 },
                  },
                }} 
              />
              <Avatar 
                sx={{ 
                  bgcolor: 'primary.main',
                  boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
                }}>
                <TeamsIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {activeTeam.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {activeTeam.sport} • {activeTeam.season} • {activeTeam._count.players} players
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Droppable area component for divisions
interface DroppableAreaProps {
  children: React.ReactNode;
  isOver?: boolean;
  isDragging?: boolean;
}

export function DroppableArea({ children, isOver, isDragging }: DroppableAreaProps) {
  return (
    <Box
      sx={{
        minHeight: isDragging ? 100 : 'auto',
        borderRadius: 1,
        transition: 'all 0.2s ease',
        ...(isDragging && {
          border: 2,
          borderStyle: 'dashed',
          borderColor: isOver ? 'primary.main' : 'divider',
          bgcolor: isOver ? alpha('#1976d2', 0.05) : 'transparent',
        }),
      }}
    >
      {children}
    </Box>
  );
}
