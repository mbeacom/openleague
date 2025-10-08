"use client";

import { useState, useOptimistic, useTransition, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge,
} from "@mui/material";
import {
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  People as PeopleIcon,
  Event as EventIcon,
  ExpandMore as ExpandMoreIcon,
  DragIndicator as DragIndicatorIcon,
} from "@mui/icons-material";
import { assignTeamToDivision } from "@/lib/actions/league";
import { useKeyboardShortcuts, useFocusNavigation } from "@/lib/hooks/useKeyboardShortcuts";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Team {
  id: string;
  name: string;
  sport: string;
  season: string;
  divisionId: string | null;
  _count?: {
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

interface LeagueTeamListProps {
  divisions: Division[];
  unassignedTeams: Team[];
  leagueId: string;
  canManageTeams: boolean;
  onTeamEdit?: (teamId: string) => void;
  onTeamView?: (teamId: string) => void;
}

export default function LeagueTeamList({
  divisions,
  unassignedTeams,
  leagueId,
  canManageTeams,
  onTeamEdit,
  onTeamView,
}: LeagueTeamListProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [focusedTeamIndex, setFocusedTeamIndex] = useState<number>(-1);
  const teamCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Create optimistic state for team transfers
  type TeamTransferAction = {
    teamId: string;
    targetDivisionId: string | null;
  };

  const [optimisticTeams, setOptimisticTeams] = useOptimistic<
    { divisions: Division[]; unassigned: Team[] },
    TeamTransferAction
  >(
    { divisions, unassigned: unassignedTeams },
    (state, action) => {
      const { teamId, targetDivisionId } = action;

      // Clone the state to avoid mutation
      let newDivisions = state.divisions.map(div => ({
        ...div,
        teams: div.teams.filter(team => team.id !== teamId),
      }));

      let newUnassigned = state.unassigned.filter(team => team.id !== teamId);

      // Find the team being moved
      let movedTeam: Team | undefined;
      for (const div of state.divisions) {
        movedTeam = div.teams.find(team => team.id === teamId);
        if (movedTeam) break;
      }
      if (!movedTeam) {
        movedTeam = state.unassigned.find(team => team.id === teamId);
      }

      if (!movedTeam) return state;

      // Update team's divisionId
      const updatedTeam = { ...movedTeam, divisionId: targetDivisionId };

      // Place team in new location
      if (targetDivisionId === null) {
        // Moving to unassigned
        newUnassigned = [...newUnassigned, updatedTeam];
      } else {
        // Moving to a division
        newDivisions = newDivisions.map(div =>
          div.id === targetDivisionId
            ? { ...div, teams: [...div.teams, updatedTeam] }
            : div
        );
      }

      return {
        divisions: newDivisions,
        unassigned: newUnassigned,
      };
    }
  );

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, team: Team) => {
    setAnchorEl(event.currentTarget);
    setSelectedTeam(team);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedTeam(null);
  };

  const handleTransferTeam = async (targetDivisionId: string | null) => {
    if (!selectedTeam) return;

    setError(null);

    // Optimistically update the UI
    startTransition(() => {
      setOptimisticTeams({
        teamId: selectedTeam.id,
        targetDivisionId,
      });
    });

    // Close the menu immediately for better UX
    handleMenuClose();

    try {
      const result = await assignTeamToDivision({
        teamId: selectedTeam.id,
        divisionId: targetDivisionId,
        leagueId,
      });

      if (!result.success) {
        setError(result.error);
      }
    } catch (err) {
      console.error("Error transferring team:", err);
      setError("Failed to transfer team. Please try again.");
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !canManageTeams) return;

    const teamId = active.id as string;
    const overId = over.id as string;

    // Find the team being dragged
    let draggedTeam: Team | undefined;
    for (const div of optimisticTeams.divisions) {
      draggedTeam = div.teams.find(t => t.id === teamId);
      if (draggedTeam) break;
    }
    if (!draggedTeam) {
      draggedTeam = optimisticTeams.unassigned.find(t => t.id === teamId);
    }

    if (!draggedTeam) return;

    // Determine target division
    let targetDivisionId: string | null = null;

    // Check if dropped on a division container
    if (overId.startsWith('division-')) {
      targetDivisionId = overId.replace('division-', '');
    } else if (overId === 'unassigned') {
      targetDivisionId = null;
    } else {
      // Dropped on another team - find which division it belongs to
      for (const div of optimisticTeams.divisions) {
        if (div.teams.some(t => t.id === overId)) {
          targetDivisionId = div.id;
          break;
        }
      }
      if (targetDivisionId === null && optimisticTeams.unassigned.some(t => t.id === overId)) {
        targetDivisionId = null;
      }
    }

    // Only transfer if moving to a different division
    if (targetDivisionId !== draggedTeam.divisionId) {
      // Optimistically update the UI
      startTransition(() => {
        setOptimisticTeams({
          teamId,
          targetDivisionId,
        });
      });

      try {
        const result = await assignTeamToDivision({
          teamId,
          divisionId: targetDivisionId,
          leagueId,
        });

        if (!result.success) {
          setError(result.error);
        }
      } catch (err) {
        console.error("Error transferring team:", err);
        setError("Failed to transfer team. Please try again.");
      }
    }
  };

  // Flatten all teams for keyboard navigation
  const allTeams = useCallback(() => {
    const teams: Team[] = [];
    optimisticTeams.divisions.forEach(div => teams.push(...div.teams));
    teams.push(...optimisticTeams.unassigned);
    return teams;
  }, [optimisticTeams]);

  // Keyboard navigation for team list
  useFocusNavigation({
    itemCount: allTeams().length,
    onSelect: (index) => {
      const teams = allTeams();
      const team = teams[index];
      if (team) {
        setFocusedTeamIndex(index);
        const cardElement = teamCardRefs.current.get(team.id);
        if (cardElement) {
          cardElement.focus();
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    },
    enabled: !Boolean(anchorEl),
    orientation: 'vertical',
    loop: true,
  });

  // Keyboard shortcuts for team actions
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Enter',
        handler: () => {
          const teams = allTeams();
          const team = teams[focusedTeamIndex];
          if (team && canManageTeams) {
            const cardElement = teamCardRefs.current.get(team.id);
            if (cardElement) {
              const moreButton = cardElement.querySelector('[data-team-menu]') as HTMLButtonElement;
              if (moreButton) {
                moreButton.click();
              }
            }
          }
        },
        description: 'Open team menu',
        enabled: focusedTeamIndex >= 0 && !anchorEl,
      },
      {
        key: 'Escape',
        handler: handleMenuClose,
        description: 'Close menu',
        enabled: Boolean(anchorEl),
      },
    ],
    enabled: true,
    preventDefault: true,
  });

  const TeamCard = ({ team }: { team: Team }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: team.id, disabled: !canManageTeams });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition: transition || 'all 0.2s ease-in-out',
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <Card
        ref={(el) => {
          setNodeRef(el);
          if (el) {
            teamCardRefs.current.set(team.id, el);
          }
        }}
        tabIndex={0}
        sx={{
          mb: 2,
          '&:hover': {
            boxShadow: 3,
            transform: isDragging ? undefined : 'translateY(-2px)',
          },
          '&:focus': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '2px',
          },
          cursor: canManageTeams ? 'grab' : 'default',
          ...style,
        }}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            {canManageTeams && (
              <Box
                {...attributes}
                {...listeners}
                sx={{
                  mr: 1,
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  '&:active': {
                    cursor: 'grabbing',
                  },
                }}
              >
                <DragIndicatorIcon color="action" />
              </Box>
            )}
            <Box flex={1}>
              <Typography variant="h6" component="h3" gutterBottom>
                {team.name}
              </Typography>
              <Box display="flex" gap={1} mb={1} flexWrap="wrap">
                <Chip label={team.sport} size="small" variant="outlined" />
                <Chip label={team.season} size="small" variant="outlined" />
              </Box>
              <Box display="flex" gap={2} alignItems="center">
                {team._count && (
                  <>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <PeopleIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {team._count.players} players
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <EventIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {team._count.events} events
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>
            </Box>
            {canManageTeams && (
              <IconButton
                onClick={(e) => handleMenuOpen(e, team)}
                disabled={isPending}
                data-team-menu
              >
                <MoreVertIcon />
              </IconButton>
            )}
          </Box>
        </CardContent>
        <CardActions>
          <Button
            size="small"
            onClick={() => onTeamView?.(team.id)}
          >
            View Team
          </Button>
          {canManageTeams && (
            <Button
              size="small"
              onClick={() => onTeamEdit?.(team.id)}
            >
              Manage
            </Button>
          )}
        </CardActions>
      </Card>
    );
  };

  const getAvailableDivisions = (currentDivisionId: string | null) => {
    return divisions.filter(div => div.id !== currentDivisionId);
  };

  // Get the active team for drag overlay
  const activeTeam = activeId
    ? allTeams().find(t => t.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Box>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {canManageTeams && (
          <Alert severity="info" sx={{ mb: 2 }}>
            💡 Tip: Drag teams between divisions or use the menu to transfer them
          </Alert>
        )}

        {/* Divisions with teams */}
        {optimisticTeams.divisions.map((division) => (
          <Accordion key={division.id} defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2} width="100%">
                <Typography variant="h6" component="h2">
                  {division.name}
                </Typography>
                {(division.ageGroup || division.skillLevel) && (
                  <Typography variant="body2" color="text.secondary">
                    ({[division.ageGroup, division.skillLevel].filter(Boolean).join(", ")})
                  </Typography>
                )}
                <Badge
                  badgeContent={division.teams.length}
                  color="primary"
                  sx={{ ml: 'auto', mr: 2 }}
                >
                  <PeopleIcon color="action" />
                </Badge>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <SortableContext
                items={division.teams.map(t => t.id)}
                strategy={verticalListSortingStrategy}
                id={`division-${division.id}`}
              >
                {division.teams.length === 0 ? (
                  <Box
                    sx={{
                      py: 4,
                      textAlign: 'center',
                      border: '2px dashed',
                      borderColor: 'divider',
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No teams in this division yet.
                      {canManageTeams && " Drag teams here to assign them."}
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    {division.teams.map((team) => (
                      <TeamCard key={team.id} team={team} />
                    ))}
                  </Box>
                )}
              </SortableContext>
            </AccordionDetails>
          </Accordion>
        ))}

        {/* Unassigned teams */}
        {optimisticTeams.unassigned.length > 0 && (
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2} width="100%">
                <Typography variant="h6" component="h2">
                  Unassigned Teams
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  (Not assigned to any division)
                </Typography>
                <Badge
                  badgeContent={optimisticTeams.unassigned.length}
                  color="secondary"
                  sx={{ ml: 'auto', mr: 2 }}
                >
                  <PeopleIcon color="action" />
                </Badge>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <SortableContext
                items={optimisticTeams.unassigned.map(t => t.id)}
                strategy={verticalListSortingStrategy}
                id="unassigned"
              >
                <Box>
                  {optimisticTeams.unassigned.map((team) => (
                    <TeamCard key={team.id} team={team} />
                  ))}
                </Box>
              </SortableContext>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Team management menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => onTeamEdit?.(selectedTeam?.id || "")}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit Team</ListItemText>
          </MenuItem>

          {selectedTeam && (
            <>
              <MenuItem disabled sx={{ opacity: 0.6 }}>
                <ListItemIcon>
                  <SwapHorizIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Transfer to Division</ListItemText>
              </MenuItem>

              {/* Option to remove from current division */}
              {selectedTeam.divisionId && (
                <MenuItem
                  onClick={() => handleTransferTeam(null)}
                  disabled={isPending}
                  sx={{ pl: 4 }}
                >
                  <ListItemText>
                    Remove from Division
                    {isPending && (
                      <CircularProgress size={16} sx={{ ml: 1 }} />
                    )}
                  </ListItemText>
                </MenuItem>
              )}

              {/* Options to move to other divisions */}
              {getAvailableDivisions(selectedTeam.divisionId).map((division) => (
                <MenuItem
                  key={division.id}
                  onClick={() => handleTransferTeam(division.id)}
                  disabled={isPending}
                  sx={{ pl: 4 }}
                >
                  <ListItemText>
                    Move to {division.name}
                    {isPending && (
                      <CircularProgress size={16} sx={{ ml: 1 }} />
                    )}
                  </ListItemText>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      </Box>

      {/* Drag overlay for visual feedback */}
      <DragOverlay>
        {activeTeam && (
          <Card
            sx={{
              opacity: 0.8,
              transform: 'rotate(5deg)',
              boxShadow: 6,
            }}
          >
            <CardContent>
              <Typography variant="h6">{activeTeam.name}</Typography>
              <Box display="flex" gap={1} mt={1}>
                <Chip label={activeTeam.sport} size="small" />
                <Chip label={activeTeam.season} size="small" />
              </Box>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}