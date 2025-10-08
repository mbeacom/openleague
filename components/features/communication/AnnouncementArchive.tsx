"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Alert,
  Divider,
  Stack,
  Badge,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Campaign as CampaignIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  Schedule as ScheduleIcon,
} from "@mui/icons-material";
import { getLeagueMessages } from "@/lib/actions/communication";
import { formatDateTime } from "@/lib/utils/date";

interface AnnouncementArchiveProps {
  leagueId: string;
}

interface LeagueAnnouncement {
  id: string;
  subject: string;
  content: string;
  priority: string;
  createdAt: Date;
  sender: {
    name: string | null;
    email: string;
  };
  recipientCount: number;
}

export const AnnouncementArchive: React.FC<AnnouncementArchiveProps> = ({ leagueId }) => {
  const [announcements, setAnnouncements] = useState<LeagueAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAnnouncement, setExpandedAnnouncement] = useState<string | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getLeagueMessages({
        leagueId,
        page,
        limit: 15,
        messageType: "ANNOUNCEMENT", // Only load announcements
        priority: (priorityFilter as "LOW" | "NORMAL" | "HIGH" | "URGENT") || undefined,
      });

      if (result.success) {
        setAnnouncements(result.data.messages.map(msg => ({
          id: msg.id,
          subject: msg.subject,
          content: msg.content,
          priority: msg.priority,
          createdAt: msg.createdAt,
          sender: msg.sender,
          recipientCount: msg.recipientCount,
        })));
        setTotalPages(result.data.pagination.totalPages);
        setTotal(result.data.pagination.total);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, [leagueId, page, priorityFilter]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handleExpandAnnouncement = (announcementId: string) => {
    setExpandedAnnouncement(expandedAnnouncement === announcementId ? null : announcementId);
  };

  const getPriorityColor = (priority: string): "error" | "warning" | "default" | "primary" | "success" | "info" | "secondary" => {
    switch (priority) {
      case "URGENT":
        return "error";
      case "HIGH":
        return "warning";
      case "LOW":
        return "default";
      default:
        return "primary";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "🚨";
      case "HIGH":
        return "📢";
      case "LOW":
        return "ℹ️";
      default:
        return "📝";
    }
  };

  const isRecent = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffInHours <= 24; // Consider announcements from last 24 hours as recent
  };

  if (loading && announcements.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <Typography>Loading announcements...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h6">
            Announcement Archive
          </Typography>
          {total > 0 && (
            <Badge badgeContent={total} color="primary">
              <CampaignIcon />
            </Badge>
          )}
        </Box>

        {/* Priority Filter */}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Priority</InputLabel>
          <Select
            value={priorityFilter}
            label="Priority"
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">All Priorities</MenuItem>
            <MenuItem value="URGENT">🚨 Urgent</MenuItem>
            <MenuItem value="HIGH">📢 High</MenuItem>
            <MenuItem value="NORMAL">📝 Normal</MenuItem>
            <MenuItem value="LOW">ℹ️ Low</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {announcements.length === 0 && !loading ? (
        <Card>
          <CardContent>
            <Box textAlign="center" py={4}>
              <CampaignIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Announcements Yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                League announcements will appear here once they are sent.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              variant="outlined"
              sx={{
                border: announcement.priority === "URGENT" ? 2 : 1,
                borderColor: announcement.priority === "URGENT" ? "error.main" : "divider",
                bgcolor: isRecent(announcement.createdAt) ? "action.hover" : "background.paper",
              }}
            >
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Box flex={1}>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <Typography variant="body2" sx={{ fontSize: "1.2em" }}>
                        {getPriorityIcon(announcement.priority)}
                      </Typography>
                      <Typography variant="h6" component="h3">
                        {announcement.subject}
                      </Typography>
                      <Chip
                        label={announcement.priority}
                        color={getPriorityColor(announcement.priority)}
                        size="small"
                      />
                      {isRecent(announcement.createdAt) && (
                        <Chip
                          label="New"
                          color="success"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>

                    <Box display="flex" alignItems="center" gap={2} mb={1}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {announcement.sender.name || announcement.sender.email}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <ScheduleIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(announcement.createdAt)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" alignItems="center" gap={0.5} mb={2}>
                      <GroupIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        Sent to {announcement.recipientCount} league members
                      </Typography>
                    </Box>
                  </Box>

                  <IconButton
                    onClick={() => handleExpandAnnouncement(announcement.id)}
                    size="small"
                  >
                    {expandedAnnouncement === announcement.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>

                <Collapse in={expandedAnnouncement === announcement.id}>
                  <Divider sx={{ mb: 2 }} />
                  <Box
                    sx={{
                      bgcolor: "background.default",
                      p: 2,
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                      {announcement.content}
                    </Typography>
                  </Box>
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={3}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      )}

      {total > 0 && (
        <Typography variant="body2" color="text.secondary" textAlign="center" mt={2}>
          Showing {announcements.length} of {total} announcements
        </Typography>
      )}
    </Box>
  );
};