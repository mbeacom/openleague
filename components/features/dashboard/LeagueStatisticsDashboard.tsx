"use client";

import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    HelpOutline as HelpOutlineIcon,
    RemoveCircleOutline as RemoveCircleOutlineIcon,
} from '@mui/icons-material';

interface LeagueStatisticsDashboardProps {
    statistics: {
        overview: {
            totalTeams: number;
            totalPlayers: number;
            totalEvents: number;
            upcomingEvents: number;
            activeDivisions: number;
        };
        participation: {
            totalRSVPs: number;
            goingCount: number;
            notGoingCount: number;
            maybeCount: number;
            noResponseCount: number;
            participationRate: number;
        };
        attendance: {
            byTeam: Array<{
                teamId: string;
                teamName: string;
                totalEvents: number;
                averageAttendance: number;
                goingRate: number;
            }>;
            byDivision: Array<{
                divisionId: string;
                divisionName: string;
                totalEvents: number;
                averageAttendance: number;
                goingRate: number;
            }>;
            overall: {
                totalEvents: number;
                averageAttendance: number;
                goingRate: number;
            };
        };
        trends: {
            monthlyActivity: Array<{
                month: string;
                teamsCreated: number;
                playersAdded: number;
                eventsScheduled: number;
            }>;
            participationTrend: Array<{
                month: string;
                participationRate: number;
                totalRSVPs: number;
            }>;
        };
    };
}

export default function LeagueStatisticsDashboard({ statistics }: LeagueStatisticsDashboardProps) {
    const { participation, attendance, trends } = statistics;

    // Calculate trend direction for participation
    const getTrendDirection = () => {
        if (trends.participationTrend.length < 2) return null;
        const latest = trends.participationTrend[trends.participationTrend.length - 1];
        const previous = trends.participationTrend[trends.participationTrend.length - 2];
        return latest.participationRate > previous.participationRate ? 'up' : 'down';
    };

    const trendDirection = getTrendDirection();

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
                League Statistics & Analytics
            </Typography>

            {/* Participation Overview */}
            <Card sx={{ mb: { xs: 2, sm: 3 } }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                    >
                        Participation Overview
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 2, sm: 3 } }}>
                        <Box>
                            <Box sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                                    >
                                        Overall Participation Rate
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography
                                            variant="h6"
                                            color="primary"
                                            sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                                        >
                                            {participation.participationRate}%
                                        </Typography>
                                        {trendDirection === 'up' && (
                                            <TrendingUpIcon color="success" sx={{ fontSize: { xs: 18, sm: 20 } }} />
                                        )}
                                        {trendDirection === 'down' && (
                                            <TrendingDownIcon color="error" sx={{ fontSize: { xs: 18, sm: 20 } }} />
                                        )}
                                    </Box>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={participation.participationRate}
                                    sx={{ height: { xs: 6, sm: 8 }, borderRadius: 1 }}
                                />
                            </Box>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                            >
                                Based on {participation.totalRSVPs} total RSVPs across all events
                            </Typography>
                        </Box>
                        <Box>
                            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                                <Grid size={{ xs: 6 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                                        <CheckCircleIcon color="success" sx={{ fontSize: { xs: 20, sm: 24 } }} />
                                        <Box>
                                            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                                {participation.goingCount}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                                            >
                                                Going
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 6 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                                        <CancelIcon color="error" sx={{ fontSize: { xs: 20, sm: 24 } }} />
                                        <Box>
                                            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                                {participation.notGoingCount}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                                            >
                                                Not Going
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 6 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                                        <HelpOutlineIcon color="warning" sx={{ fontSize: { xs: 20, sm: 24 } }} />
                                        <Box>
                                            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                                {participation.maybeCount}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                                            >
                                                Maybe
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 6 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                                        <RemoveCircleOutlineIcon color="disabled" sx={{ fontSize: { xs: 20, sm: 24 } }} />
                                        <Box>
                                            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                                {participation.noResponseCount}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                                            >
                                                No Response
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Attendance by Team */}
            <Card sx={{ mb: { xs: 2, sm: 3 } }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                    >
                        Attendance by Team
                    </Typography>
                    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: { xs: 500, sm: 'auto' } }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Team Name</TableCell>
                                    <TableCell align="right">Total Events</TableCell>
                                    <TableCell align="right">Avg Attendance</TableCell>
                                    <TableCell align="right">Going Rate</TableCell>
                                    <TableCell align="right">Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {attendance.byTeam.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center">
                                            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                                No team data available
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    attendance.byTeam.map((team) => (
                                        <TableRow key={team.teamId}>
                                            <TableCell>{team.teamName}</TableCell>
                                            <TableCell align="right">{team.totalEvents}</TableCell>
                                            <TableCell align="right">{team.averageAttendance}</TableCell>
                                            <TableCell align="right">{team.goingRate}%</TableCell>
                                            <TableCell align="right">
                                                {team.goingRate >= 70 && (
                                                    <Chip label="Excellent" color="success" size="small" />
                                                )}
                                                {team.goingRate >= 50 && team.goingRate < 70 && (
                                                    <Chip label="Good" color="primary" size="small" />
                                                )}
                                                {team.goingRate >= 30 && team.goingRate < 50 && (
                                                    <Chip label="Fair" color="warning" size="small" />
                                                )}
                                                {team.goingRate < 30 && team.totalEvents > 0 && (
                                                    <Chip label="Low" color="error" size="small" />
                                                )}
                                                {team.totalEvents === 0 && (
                                                    <Chip label="No Events" color="default" size="small" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Attendance by Division */}
            {attendance.byDivision.length > 0 && (
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            Attendance by Division
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Division Name</TableCell>
                                        <TableCell align="right">Total Events</TableCell>
                                        <TableCell align="right">Avg Attendance</TableCell>
                                        <TableCell align="right">Going Rate</TableCell>
                                        <TableCell align="right">Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {attendance.byDivision.map((division) => (
                                        <TableRow key={division.divisionId}>
                                            <TableCell>{division.divisionName}</TableCell>
                                            <TableCell align="right">{division.totalEvents}</TableCell>
                                            <TableCell align="right">{division.averageAttendance}</TableCell>
                                            <TableCell align="right">{division.goingRate}%</TableCell>
                                            <TableCell align="right">
                                                {division.goingRate >= 70 && (
                                                    <Chip label="Excellent" color="success" size="small" />
                                                )}
                                                {division.goingRate >= 50 && division.goingRate < 70 && (
                                                    <Chip label="Good" color="primary" size="small" />
                                                )}
                                                {division.goingRate >= 30 && division.goingRate < 50 && (
                                                    <Chip label="Fair" color="warning" size="small" />
                                                )}
                                                {division.goingRate < 30 && division.totalEvents > 0 && (
                                                    <Chip label="Low" color="error" size="small" />
                                                )}
                                                {division.totalEvents === 0 && (
                                                    <Chip label="No Events" color="default" size="small" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}

            {/* Monthly Activity Trends */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Monthly Activity Trends (Last 6 Months)
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Month</TableCell>
                                    <TableCell align="right">Teams Created</TableCell>
                                    <TableCell align="right">Players Added</TableCell>
                                    <TableCell align="right">Events Scheduled</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {trends.monthlyActivity.map((month) => (
                                    <TableRow key={month.month}>
                                        <TableCell>{month.month}</TableCell>
                                        <TableCell align="right">{month.teamsCreated}</TableCell>
                                        <TableCell align="right">{month.playersAdded}</TableCell>
                                        <TableCell align="right">{month.eventsScheduled}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Participation Trend */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Participation Rate Trend (Last 6 Months)
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Month</TableCell>
                                    <TableCell align="right">Participation Rate</TableCell>
                                    <TableCell align="right">Total RSVPs</TableCell>
                                    <TableCell align="right">Trend</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {trends.participationTrend.map((month, index) => {
                                    const prevMonth = index > 0 ? trends.participationTrend[index - 1] : null;
                                    const trend = prevMonth
                                        ? month.participationRate > prevMonth.participationRate
                                            ? 'up'
                                            : month.participationRate < prevMonth.participationRate
                                                ? 'down'
                                                : 'stable'
                                        : 'stable';

                                    return (
                                        <TableRow key={month.month}>
                                            <TableCell>{month.month}</TableCell>
                                            <TableCell align="right">{month.participationRate}%</TableCell>
                                            <TableCell align="right">{month.totalRSVPs}</TableCell>
                                            <TableCell align="right">
                                                {trend === 'up' && (
                                                    <Chip
                                                        icon={<TrendingUpIcon />}
                                                        label="Up"
                                                        color="success"
                                                        size="small"
                                                    />
                                                )}
                                                {trend === 'down' && (
                                                    <Chip
                                                        icon={<TrendingDownIcon />}
                                                        label="Down"
                                                        color="error"
                                                        size="small"
                                                    />
                                                )}
                                                {trend === 'stable' && (
                                                    <Chip label="Stable" color="default" size="small" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>
        </Box>
    );
}
