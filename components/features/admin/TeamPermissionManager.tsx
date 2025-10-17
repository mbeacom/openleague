"use client";

import React, { useState } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";
import {
    Edit as EditIcon,
    Delete as DeleteIcon,
    PersonAdd as PersonAddIcon,
    ExpandMore as ExpandMoreIcon,
    Group as GroupIcon,
} from "@mui/icons-material";
import {
    assignTeamRoleAction,
    removeTeamRoleAction,
    getTeamMembersWithRoles,
    type AssignTeamRoleInput,
    type RemoveTeamRoleInput,
} from "@/lib/actions/permissions";

interface TeamPermissionManagerProps {
    leagueId: string;
    teams: Array<{
        id: string;
        name: string;
        sport: string;
        season: string;
    }>;
    currentUserId: string;
    currentUserRole: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";
}

interface TeamMember {
    id: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
}

interface TeamMembersState {
    [teamId: string]: {
        members: TeamMember[];
        loading: boolean;
        error: string | null;
    };
}

export const TeamPermissionManager: React.FC<TeamPermissionManagerProps> = ({
    leagueId,
    teams,
    currentUserId,
    currentUserRole,
}) => {
    const [teamMembers, setTeamMembers] = useState<TeamMembersState>({});
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [selectedRole, setSelectedRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
    const [actionLoading, setActionLoading] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);

    // Only league admins and team admins can manage team permissions
    const canManagePermissions = currentUserRole === "LEAGUE_ADMIN" || currentUserRole === "TEAM_ADMIN";

    const loadTeamMembers = async (teamId: string) => {
        try {
            setTeamMembers(prev => ({
                ...prev,
                [teamId]: {
                    ...prev[teamId],
                    loading: true,
                    error: null,
                },
            }));

            const result = await getTeamMembersWithRoles(leagueId, teamId);

            if (result.success) {
                setTeamMembers(prev => ({
                    ...prev,
                    [teamId]: {
                        members: result.data,
                        loading: false,
                        error: null,
                    },
                }));
            } else {
                setTeamMembers(prev => ({
                    ...prev,
                    [teamId]: {
                        members: [],
                        loading: false,
                        error: result.error,
                    },
                }));
            }
        } catch (err) {
            setTeamMembers(prev => ({
                ...prev,
                [teamId]: {
                    members: [],
                    loading: false,
                    error: "Failed to load team members",
                },
            }));
            console.error("Error loading team members:", err);
        }
    };

    const handleEditRole = (teamId: string, member: TeamMember) => {
        setSelectedTeam(teamId);
        setSelectedMember(member);
        setSelectedRole(member.role as "ADMIN" | "MEMBER");
        setEditDialogOpen(true);
    };

    const handleSaveRole = async () => {
        if (!selectedTeam || !selectedMember) return;

        try {
            setActionLoading(true);
            setGlobalError(null);

            const input: AssignTeamRoleInput = {
                leagueId,
                teamId: selectedTeam,
                targetUserId: selectedMember.id,
                role: selectedRole,
            };

            const result = await assignTeamRoleAction(input);

            if (result.success) {
                setEditDialogOpen(false);
                setSelectedTeam(null);
                setSelectedMember(null);
                await loadTeamMembers(selectedTeam); // Reload team members
            } else {
                setGlobalError(result.error);
            }
        } catch (err) {
            setGlobalError("Failed to update team member role");
            console.error("Error updating role:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveMember = async (teamId: string, member: TeamMember) => {
        if (!confirm(`Are you sure you want to remove ${member.name || member.email} from this team?`)) {
            return;
        }

        try {
            setActionLoading(true);
            setGlobalError(null);

            const input: RemoveTeamRoleInput = {
                leagueId,
                teamId,
                targetUserId: member.id,
            };

            const result = await removeTeamRoleAction(input);

            if (result.success) {
                await loadTeamMembers(teamId); // Reload team members
            } else {
                setGlobalError(result.error);
            }
        } catch (err) {
            setGlobalError("Failed to remove team member");
            console.error("Error removing member:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case "ADMIN":
                return "error";
            case "MEMBER":
                return "info";
            default:
                return "default";
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case "ADMIN":
                return "Admin";
            case "MEMBER":
                return "Member";
            default:
                return role;
        }
    };

    if (!canManagePermissions) {
        return (
            <Card>
                <CardContent>
                    <Alert severity="info">
                        You need admin permissions to manage team member roles.
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" component="h2">
                        Team Member Permissions
                    </Typography>
                </Box>

                {globalError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {globalError}
                    </Alert>
                )}

                {teams.map((team) => {
                    const teamData = teamMembers[team.id];

                    return (
                        <Accordion key={team.id}>
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                onClick={() => {
                                    if (!teamData) {
                                        loadTeamMembers(team.id);
                                    }
                                }}
                            >
                                <Box display="flex" alignItems="center" gap={1}>
                                    <GroupIcon />
                                    <Typography variant="subtitle1">
                                        {team.name}
                                    </Typography>
                                    <Chip
                                        label={`${team.sport} - ${team.season}`}
                                        size="small"
                                        variant="outlined"
                                    />
                                    {teamData && (
                                        <Chip
                                            label={`${teamData.members.length} members`}
                                            size="small"
                                            color="primary"
                                        />
                                    )}
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                {teamData?.loading && (
                                    <Box display="flex" justifyContent="center" p={2}>
                                        <CircularProgress />
                                    </Box>
                                )}

                                {teamData?.error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {teamData.error}
                                    </Alert>
                                )}

                                {teamData?.members && (
                                    <>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                            <Typography variant="subtitle2">
                                                Team Members ({teamData.members.length})
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<PersonAddIcon />}
                                                disabled={true}
                                                title="Team member invitation functionality will be available in a future update"
                                            >
                                                Add Member
                                            </Button>
                                        </Box>

                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Member</TableCell>
                                                        <TableCell>Email</TableCell>
                                                        <TableCell>Role</TableCell>
                                                        <TableCell>Joined</TableCell>
                                                        <TableCell align="right">Actions</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {teamData.members.map((member) => (
                                                        <TableRow key={member.id}>
                                                            <TableCell>
                                                                <Typography variant="body2">
                                                                    {member.name || "No name"}
                                                                    {member.id === currentUserId && (
                                                                        <Chip label="You" size="small" sx={{ ml: 1 }} />
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2">
                                                                    {member.email}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label={getRoleLabel(member.role)}
                                                                    color={getRoleColor(member.role) as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                                                                    size="small"
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2">
                                                                    {new Date(member.joinedAt).toLocaleDateString()}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Tooltip title="Edit Role">
                                                                    <IconButton
                                                                        size="small"
                                                                        onClick={() => handleEditRole(team.id, member)}
                                                                        disabled={actionLoading}
                                                                    >
                                                                        <EditIcon />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                {member.id !== currentUserId && (
                                                                    <Tooltip title="Remove Member">
                                                                        <IconButton
                                                                            size="small"
                                                                            onClick={() => handleRemoveMember(team.id, member)}
                                                                            disabled={actionLoading}
                                                                            color="error"
                                                                        >
                                                                            <DeleteIcon />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </>
                                )}
                            </AccordionDetails>
                        </Accordion>
                    );
                })}

                {/* Edit Role Dialog */}
                <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
                    <DialogTitle>
                        Edit Role for {selectedMember?.name || selectedMember?.email}
                    </DialogTitle>
                    <DialogContent>
                        <FormControl fullWidth sx={{ mt: 2 }}>
                            <InputLabel>Role</InputLabel>
                            <Select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as "ADMIN" | "MEMBER")}
                                label="Role"
                            >
                                <MenuItem value="MEMBER">Member</MenuItem>
                                <MenuItem value="ADMIN">Admin</MenuItem>
                            </Select>
                        </FormControl>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleSaveRole}
                            variant="contained"
                            disabled={actionLoading}
                        >
                            {actionLoading ? <CircularProgress size={20} /> : "Save"}
                        </Button>
                    </DialogActions>
                </Dialog>
            </CardContent>
        </Card>
    );
};