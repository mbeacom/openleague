"use client";

import React, { useState, useEffect } from "react";
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
} from "@mui/material";
import {
    Edit as EditIcon,
    Delete as DeleteIcon,
    PersonAdd as PersonAddIcon,
    Security as SecurityIcon,
} from "@mui/icons-material";
import {
    getLeagueUsersAction,
    assignLeagueRoleAction,
    removeLeagueRoleAction,
    getUserPermissionsAction,
    type AssignLeagueRoleInput,
    type RemoveLeagueRoleInput,
} from "@/lib/actions/permissions";
import { LeagueAccessLevel } from "@/lib/utils/security";
import { Permission } from "@/lib/utils/permissions";

interface UserPermissionManagerProps {
    leagueId: string;
    currentUserId: string;
    currentUserRole: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";
}

interface LeagueUser {
    id: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
}

interface UserPermissions {
    permissions: Permission[];
    accessLevel: LeagueAccessLevel;
}

export const UserPermissionManager: React.FC<UserPermissionManagerProps> = ({
    leagueId,
    currentUserId,
    currentUserRole,
}) => {
    const [users, setUsers] = useState<LeagueUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<LeagueUser | null>(null);
    const [selectedRole, setSelectedRole] = useState<"LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER">("MEMBER");
    const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Only league admins can manage permissions
    const canManagePermissions = currentUserRole === "LEAGUE_ADMIN";

    useEffect(() => {
        loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leagueId]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await getLeagueUsersAction({ leagueId });

            if (result.success) {
                setUsers(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError("Failed to load users");
            console.error("Error loading users:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleEditRole = (user: LeagueUser) => {
        setSelectedUser(user);
        setSelectedRole(user.role as "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER");
        setEditDialogOpen(true);
    };

    const handleViewPermissions = async (user: LeagueUser) => {
        try {
            setSelectedUser(user);
            setPermissionsDialogOpen(true);
            setUserPermissions(null);

            const result = await getUserPermissionsAction({
                leagueId,
                targetUserId: user.id,
            });

            if (result.success) {
                setUserPermissions(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError("Failed to load user permissions");
            console.error("Error loading permissions:", err);
        }
    };

    const handleSaveRole = async () => {
        if (!selectedUser) return;

        try {
            setActionLoading(true);
            setError(null);

            const input: AssignLeagueRoleInput = {
                leagueId,
                targetUserId: selectedUser.id,
                role: selectedRole,
            };

            const result = await assignLeagueRoleAction(input);

            if (result.success) {
                setEditDialogOpen(false);
                setSelectedUser(null);
                await loadUsers(); // Reload to get updated data
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError("Failed to update user role");
            console.error("Error updating role:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveUser = async (user: LeagueUser) => {
        if (!confirm(`Are you sure you want to remove ${user.name || user.email} from this league?`)) {
            return;
        }

        try {
            setActionLoading(true);
            setError(null);

            const input: RemoveLeagueRoleInput = {
                leagueId,
                targetUserId: user.id,
            };

            const result = await removeLeagueRoleAction(input);

            if (result.success) {
                await loadUsers(); // Reload to get updated data
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError("Failed to remove user");
            console.error("Error removing user:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case "LEAGUE_ADMIN":
                return "error";
            case "TEAM_ADMIN":
                return "warning";
            case "MEMBER":
                return "info";
            default:
                return "default";
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case "LEAGUE_ADMIN":
                return "League Admin";
            case "TEAM_ADMIN":
                return "Team Admin";
            case "MEMBER":
                return "Member";
            default:
                return role;
        }
    };

    const getAccessLevelLabel = (level: LeagueAccessLevel) => {
        switch (level) {
            case LeagueAccessLevel.LEAGUE_ADMIN:
                return "League Admin";
            case LeagueAccessLevel.TEAM_ADMIN:
                return "Team Admin";
            case LeagueAccessLevel.MEMBER:
                return "Member";
            case LeagueAccessLevel.NONE:
                return "No Access";
            default:
                return "Unknown";
        }
    };

    const formatPermissionName = (permission: Permission) => {
        return permission
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l: string) => l.toUpperCase());
    };

    if (!canManagePermissions) {
        return (
            <Card>
                <CardContent>
                    <Alert severity="info">
                        You need league admin permissions to manage user roles and permissions.
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    if (loading) {
        return (
            <Card>
                <CardContent>
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                        <CircularProgress />
                    </Box>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" component="h2">
                        User Permissions
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<PersonAddIcon />}
                        disabled={true}
                        title="User invitation functionality will be available in a future update"
                    >
                        Invite User
                    </Button>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>User</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Joined</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {user.name || "No name"}
                                            {user.id === currentUserId && (
                                                <Chip label="You" size="small" sx={{ ml: 1 }} />
                                            )}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={getRoleLabel(user.role)}
                                            color={getRoleColor(user.role) as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {new Date(user.joinedAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="View Permissions">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleViewPermissions(user)}
                                            >
                                                <SecurityIcon />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Edit Role">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleEditRole(user)}
                                                disabled={actionLoading}
                                            >
                                                <EditIcon />
                                            </IconButton>
                                        </Tooltip>
                                        {user.id !== currentUserId && (
                                            <Tooltip title="Remove User">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleRemoveUser(user)}
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

                {/* Edit Role Dialog */}
                <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
                    <DialogTitle>
                        Edit Role for {selectedUser?.name || selectedUser?.email}
                    </DialogTitle>
                    <DialogContent>
                        <FormControl fullWidth sx={{ mt: 2 }}>
                            <InputLabel>Role</InputLabel>
                            <Select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER")}
                                label="Role"
                            >
                                <MenuItem value="MEMBER">Member</MenuItem>
                                <MenuItem value="TEAM_ADMIN">Team Admin</MenuItem>
                                <MenuItem value="LEAGUE_ADMIN">League Admin</MenuItem>
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

                {/* View Permissions Dialog */}
                <Dialog
                    open={permissionsDialogOpen}
                    onClose={() => setPermissionsDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle>
                        Permissions for {selectedUser?.name || selectedUser?.email}
                    </DialogTitle>
                    <DialogContent>
                        {userPermissions ? (
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    Access Level: {getAccessLevelLabel(userPermissions.accessLevel)}
                                </Typography>

                                <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                                    Permissions:
                                </Typography>

                                <Box display="flex" flexWrap="wrap" gap={1}>
                                    {userPermissions.permissions.map((permission) => (
                                        <Chip
                                            key={permission}
                                            label={formatPermissionName(permission)}
                                            size="small"
                                            variant="outlined"
                                        />
                                    ))}
                                </Box>

                                {userPermissions.permissions.length === 0 && (
                                    <Typography color="text.secondary">
                                        No permissions assigned
                                    </Typography>
                                )}
                            </Box>
                        ) : (
                            <Box display="flex" justifyContent="center" p={2}>
                                <CircularProgress />
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setPermissionsDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogActions>
                </Dialog>
            </CardContent>
        </Card>
    );
};