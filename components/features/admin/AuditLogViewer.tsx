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
    Alert,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Button,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Pagination,
} from "@mui/material";
import {
    ExpandMore as ExpandMoreIcon,
    Security as SecurityIcon,
    Warning as WarningIcon,
    Info as InfoIcon,
    Error as ErrorIcon,
} from "@mui/icons-material";
import { getAuditLogsAction, type AuditLogEntry } from "@/lib/actions/audit";

interface AuditLogViewerProps {
    leagueId: string;
    currentUserRole: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
    leagueId,
    currentUserRole,
}) => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [severityFilter, setSeverityFilter] = useState<string>("all");
    const [userFilter, setUserFilter] = useState<string>("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const itemsPerPage = 10;

    // Only league admins can view audit logs
    const canViewAuditLogs = currentUserRole === "LEAGUE_ADMIN";

    useEffect(() => {
        if (canViewAuditLogs) {
            loadAuditLogs();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leagueId, canViewAuditLogs, page, actionFilter, severityFilter, userFilter]);

    const loadAuditLogs = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await getAuditLogsAction({
                leagueId,
                page,
                limit: itemsPerPage,
                action: actionFilter !== "all" ? actionFilter : undefined,
                severity: severityFilter !== "all" ? (severityFilter as "info" | "warning" | "error") : undefined,
                userEmail: userFilter.trim() || undefined,
            });

            if (result.success) {
                setLogs(result.data.logs);
                setTotalPages(result.data.totalPages);
                setTotalCount(result.data.totalCount);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError("Failed to load audit logs");
            console.error("Error loading audit logs:", err);
        } finally {
            setLoading(false);
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case "error":
                return <ErrorIcon color="error" />;
            case "warning":
                return <WarningIcon color="warning" />;
            case "info":
            default:
                return <InfoIcon color="info" />;
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case "error":
                return "error";
            case "warning":
                return "warning";
            case "info":
            default:
                return "info";
        }
    };

    const formatActionName = (action: string) => {
        return action
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
    };

    // Get unique actions from current logs for filter dropdown
    const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

    const handleFilterChange = () => {
        // Reset to page 1 when filters change
        setPage(1);
    };

    if (!canViewAuditLogs) {
        return (
            <Card>
                <CardContent>
                    <Alert severity="info">
                        You need league admin permissions to view audit logs.
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
                        <SecurityIcon sx={{ mr: 1, verticalAlign: "middle" }} />
                        Audit Log
                    </Typography>
                    <Button
                        variant="outlined"
                        onClick={loadAuditLogs}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Filters */}
                <Box display="flex" gap={2} mb={3} flexWrap="wrap">
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Action</InputLabel>
                        <Select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            label="Action"
                        >
                            <MenuItem value="all">All Actions</MenuItem>
                            {uniqueActions.map(action => (
                                <MenuItem key={action} value={action}>
                                    {formatActionName(action)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Severity</InputLabel>
                        <Select
                            value={severityFilter}
                            onChange={(e) => {
                                setSeverityFilter(e.target.value);
                                handleFilterChange();
                            }}
                            label="Severity"
                        >
                            <MenuItem value="all">All</MenuItem>
                            <MenuItem value="info">Info</MenuItem>
                            <MenuItem value="warning">Warning</MenuItem>
                            <MenuItem value="error">Error</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        size="small"
                        label="Search User"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        onBlur={handleFilterChange}
                        onKeyPress={(e) => {
                            if (e.key === "Enter") {
                                handleFilterChange();
                            }
                        }}
                        placeholder="Email or name..."
                        sx={{ minWidth: 200 }}
                    />
                </Box>

                {/* Results Summary */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Showing {logs.length} of {totalCount} entries
                </Typography>

                {/* Audit Log Table */}
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Timestamp</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Severity</TableCell>
                                <TableCell>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {formatActionName(log.action)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2">
                                                {log.userName || "Unknown"}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {log.userEmail}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            {getSeverityIcon(log.severity)}
                                            <Chip
                                                label={log.severity.toUpperCase()}
                                                color={getSeverityColor(log.severity) as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                                                size="small"
                                            />
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        {log.details && Object.keys(log.details).length > 0 ? (
                                            <Accordion>
                                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                                    <Typography variant="body2">
                                                        View Details
                                                    </Typography>
                                                </AccordionSummary>
                                                <AccordionDetails>
                                                    <Typography variant="body2" component="pre" sx={{ whiteSpace: "pre-wrap" }}>
                                                        {JSON.stringify(log.details, null, 2)}
                                                    </Typography>
                                                </AccordionDetails>
                                            </Accordion>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                No details
                                            </Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Pagination */}
                {totalPages > 1 && (
                    <Box display="flex" justifyContent="center" mt={2}>
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(_, newPage) => setPage(newPage)}
                            color="primary"
                        />
                    </Box>
                )}

                {logs.length === 0 && !loading && (
                    <Box textAlign="center" py={4}>
                        <Typography color="text.secondary">
                            No audit log entries found matching your filters.
                        </Typography>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};