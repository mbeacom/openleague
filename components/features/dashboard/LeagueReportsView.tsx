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
    PictureAsPdf as PdfIcon,
    People as PeopleIcon,
    Event as EventIcon,
    Assessment as AssessmentIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import {
    exportLeagueRosterCSV,
    exportLeagueRosterPDF,
    exportLeagueScheduleCSV,
    exportLeagueSchedulePDF,
    exportAttendanceReportCSV,
    exportAttendanceReportPDF,
    exportFinancialReportCSV,
    exportFinancialReportPDF,
} from '@/lib/actions/league';

interface LeagueReportsViewProps {
    leagueId: string;
    isAdmin: boolean;
}

type ReportExportResult =
    | { success: true; data: { csv: string; filename: string } | { pdfBase64: string; filename: string } }
    | { success: false; error: string; details?: unknown };

type ReportExportAction = () => Promise<ReportExportResult>;

export default function LeagueReportsView({ leagueId, isAdmin }: LeagueReportsViewProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const downloadCSV = (csv: string, filename: string) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, filename);
    };

    const downloadPDF = (pdfBase64: string, filename: string) => {
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        const blob = new Blob([bytes], { type: 'application/pdf' });
        downloadBlob(blob, filename);
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExport = async (
        reportId: string,
        format: 'csv' | 'pdf',
        action: ReportExportAction,
        fallbackError: string
    ) => {
        setLoading(`${reportId}-${format}`);
        setError(null);

        try {
            const result = await action();
            if (result.success) {
                if ('csv' in result.data) {
                    downloadCSV(result.data.csv, result.data.filename);
                } else {
                    downloadPDF(result.data.pdfBase64, result.data.filename);
                }
            } else {
                setError(result.error);
            }
        } catch {
            setError(fallbackError);
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
            csvAction: () => exportLeagueRosterCSV(leagueId),
            pdfAction: () => exportLeagueRosterPDF(leagueId),
            fallbackError: 'Failed to export roster',
            adminOnly: false,
        },
        {
            id: 'schedule',
            title: 'League Schedule',
            description: 'Export all events and games for all teams',
            icon: EventIcon,
            csvAction: () => exportLeagueScheduleCSV(leagueId),
            pdfAction: () => exportLeagueSchedulePDF(leagueId),
            fallbackError: 'Failed to export schedule',
            adminOnly: false,
        },
        {
            id: 'attendance',
            title: 'Attendance Report',
            description: 'Export attendance statistics by division and team',
            icon: AssessmentIcon,
            csvAction: () => exportAttendanceReportCSV(leagueId),
            pdfAction: () => exportAttendanceReportPDF(leagueId),
            fallbackError: 'Failed to export attendance report',
            adminOnly: false,
        },
        {
            id: 'financial',
            title: 'Financial Report',
            description: 'Export roster size, event volume, ice-time requests, and known accepted venue costs',
            icon: MoneyIcon,
            csvAction: () => exportFinancialReportCSV(leagueId),
            pdfAction: () => exportFinancialReportPDF(leagueId),
            fallbackError: 'Failed to export financial report',
            adminOnly: true,
        },
    ];

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography
                variant="h5"
                gutterBottom
                sx={{
                    mb: { xs: 2, sm: 3 },
                    fontSize: { xs: '1.25rem', sm: '1.5rem' }
                }}
            >
                League Reports & Exports
            </Typography>

            <Typography
                variant="body1"
                color="text.secondary"
                sx={{
                    mb: { xs: 3, sm: 4 },
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                }}
            >
                Download reports in CSV or PDF format for analysis, record keeping, or sharing with stakeholders.
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
                    const isCsvLoading = loading === `${report.id}-csv`;
                    const isPdfLoading = loading === `${report.id}-pdf`;
                    const isLoading = isCsvLoading || isPdfLoading;

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
                                <CardContent sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        <Box
                                            sx={{
                                                width: { xs: 40, sm: 48 },
                                                height: { xs: 40, sm: 48 },
                                                borderRadius: 1,
                                                bgcolor: 'primary.main',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                mr: { xs: 1.5, sm: 2 },
                                            }}
                                        >
                                            <Icon sx={{ fontSize: { xs: 24, sm: 28 }, color: 'white' }} />
                                        </Box>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography
                                                variant="h6"
                                                component="h3"
                                                sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                                            >
                                                {report.title}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                            mb: 2,
                                            fontSize: { xs: '0.8rem', sm: '0.875rem' }
                                        }}
                                    >
                                        {report.description}
                                    </Typography>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                                        <Button
                                            variant="contained"
                                            startIcon={isCsvLoading ? <CircularProgress size={20} /> : <DownloadIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
                                            onClick={() => handleExport(report.id, 'csv', report.csvAction, report.fallbackError)}
                                            disabled={isDisabled || isLoading}
                                            fullWidth
                                            size="small"
                                            sx={{
                                                minHeight: 44,
                                                fontSize: { xs: '0.8rem', sm: '0.875rem' }
                                            }}
                                        >
                                            {isCsvLoading ? 'Exporting...' : 'CSV'}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={isPdfLoading ? <CircularProgress size={20} /> : <PdfIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
                                            onClick={() => handleExport(report.id, 'pdf', report.pdfAction, report.fallbackError)}
                                            disabled={isDisabled || isLoading}
                                            fullWidth
                                            size="small"
                                            sx={{
                                                minHeight: 44,
                                                fontSize: { xs: '0.8rem', sm: '0.875rem' }
                                            }}
                                        >
                                            {isPdfLoading ? 'Exporting...' : 'PDF'}
                                        </Button>
                                    </Box>
                                    {isDisabled && (
                                        <Typography
                                            variant="caption"
                                            color="error"
                                            sx={{
                                                mt: 1,
                                                display: 'block',
                                                fontSize: { xs: '0.7rem', sm: '0.75rem' }
                                            }}
                                        >
                                            Admin access required
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            <Box sx={{ mt: { xs: 3, sm: 4 } }}>
                <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                >
                    About Report Exports
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    paragraph
                    sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                >
                    CSV files can be opened in spreadsheet applications like Microsoft Excel, Google Sheets, or Apple Numbers. PDF exports provide a readable snapshot for sharing or archival.
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                >
                    All exports include current data as of the download time. For historical tracking, save exports with dated filenames.
                </Typography>
            </Box>
        </Box>
    );
}
