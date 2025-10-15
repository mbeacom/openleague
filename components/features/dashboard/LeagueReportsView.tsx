"use client";

import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Grid,
    Alert,
    CircularProgress,
} from '@mui/material';
import {
    Download as DownloadIcon,
    People as PeopleIcon,
    Event as EventIcon,
    Assessment as AssessmentIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import {
    exportLeagueRosterCSV,
    exportLeagueScheduleCSV,
    exportAttendanceReportCSV,
    exportFinancialReportCSV,
} from '@/lib/actions/league';

interface LeagueReportsViewProps {
    leagueId: string;
    isAdmin: boolean;
}

export default function LeagueReportsView({ leagueId, isAdmin }: LeagueReportsViewProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const downloadCSV = (csv: string, filename: string) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportRoster = async () => {
        setLoading('roster');
        setError(null);
        try {
            const result = await exportLeagueRosterCSV(leagueId);
            if (result.success) {
                downloadCSV(result.data.csv, result.data.filename);
            } else {
                setError(result.error);
            }
        } catch {
            setError('Failed to export roster');
        } finally {
            setLoading(null);
        }
    };

    const handleExportSchedule = async () => {
        setLoading('schedule');
        setError(null);
        try {
            const result = await exportLeagueScheduleCSV(leagueId);
            if (result.success) {
                downloadCSV(result.data.csv, result.data.filename);
            } else {
                setError(result.error);
            }
        } catch {
            setError('Failed to export schedule');
        } finally {
            setLoading(null);
        }
    };

    const handleExportAttendance = async () => {
        setLoading('attendance');
        setError(null);
        try {
            const result = await exportAttendanceReportCSV(leagueId);
            if (result.success) {
                downloadCSV(result.data.csv, result.data.filename);
            } else {
                setError(result.error);
            }
        } catch {
            setError('Failed to export attendance report');
        } finally {
            setLoading(null);
        }
    };

    const handleExportFinancial = async () => {
        setLoading('financial');
        setError(null);
        try {
            const result = await exportFinancialReportCSV(leagueId);
            if (result.success) {
                downloadCSV(result.data.csv, result.data.filename);
            } else {
                setError(result.error);
            }
        } catch {
            setError('Failed to export financial report');
        } finally {
            setLoading(null);
        }
    };

    const reports = [
        {
            id: 'roster',
            title: 'League Roster',
            description: 'Export complete roster with all players across all teams',
            icon: PeopleIcon,
            action: handleExportRoster,
            adminOnly: false,
        },
        {
            id: 'schedule',
            title: 'League Schedule',
            description: 'Export all events and games for all teams',
            icon: EventIcon,
            action: handleExportSchedule,
            adminOnly: false,
        },
        {
            id: 'attendance',
            title: 'Attendance Report',
            description: 'Export attendance statistics by division and team',
            icon: AssessmentIcon,
            action: handleExportAttendance,
            adminOnly: false,
        },
        {
            id: 'financial',
            title: 'Financial Report',
            description: 'Export basic team and player summary (MVP - Payment tracking not yet implemented)',
            icon: MoneyIcon,
            action: handleExportFinancial,
            adminOnly: true,
        },
    ];

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
                League Reports & Exports
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Download reports in CSV format for analysis, record keeping, or sharing with stakeholders.
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={3}>
                {reports.map((report) => {
                    const Icon = report.icon;
                    const isDisabled = report.adminOnly && !isAdmin;
                    const isLoading = loading === report.id;

                    return (
                        <Grid size={{ xs: 12, sm: 6, md: 6 }} key={report.id}>
                            <Card
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    opacity: isDisabled ? 0.6 : 1,
                                }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        <Box
                                            sx={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 1,
                                                bgcolor: 'primary.main',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                mr: 2,
                                            }}
                                        >
                                            <Icon sx={{ fontSize: 28, color: 'white' }} />
                                        </Box>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="h6" component="h3">
                                                {report.title}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {report.description}
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={isLoading ? <CircularProgress size={20} /> : <DownloadIcon />}
                                        onClick={report.action}
                                        disabled={isDisabled || isLoading}
                                        fullWidth
                                    >
                                        {isLoading ? 'Exporting...' : 'Export CSV'}
                                    </Button>
                                    {isDisabled && (
                                        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                                            Admin access required
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                    About CSV Exports
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                    CSV (Comma-Separated Values) files can be opened in spreadsheet applications like Microsoft Excel, Google Sheets, or Apple Numbers.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    All exports include current data as of the download time. For historical tracking, save exports with dated filenames.
                </Typography>
            </Box>
        </Box>
    );
}
