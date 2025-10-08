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
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Message as MessageIcon,
  Campaign as CampaignIcon,
  Person as PersonIcon,
  Group as GroupIcon,
} from "@mui/icons-material";
import { getLeagueMessages } from "@/lib/actions/communication";
import { formatDateTime } from "@/lib/utils/date";

interface MessageHistoryProps {
  leagueId: string;
}

interface LeagueMessage {
  id: string;
  subject: string;
  content: string;
  messageType: string;
  priority: string;
  createdAt: Date;
  sender: {
    name: string | null;
    email: string;
  };
  recipientCount: number;
  targeting: Array<{
    entireLeague: boolean;
    division?: { name: string } | null;
    team?: { name: string } | null;
  }>;
}

export const MessageHistory: React.FC<MessageHistoryProps> = ({ leagueId }) => {
  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);

  // Filters
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getLeagueMessages({
        leagueId,
        page,
        limit: 10,
        messageType: (messageTypeFilter as "MESSAGE" | "ANNOUNCEMENT") || undefined,
        priority: (priorityFilter as "LOW" | "NORMAL" | "HIGH" | "URGENT") || undefined,
      });

      if (result.success) {
        setMessages(result.data.messages);
        setTotalPages(result.data.pagination.totalPages);
        setTotal(result.data.pagination.total);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [leagueId, page, messageTypeFilter, priorityFilter]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleExpandMessage = (messageId: string) => {
    setExpandedMessage(expandedMessage === messageId ? null : messageId);
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

  const getTargetingDescription = (targeting: LeagueMessage["targeting"]) => {
    if (targeting.some(t => t.entireLeague)) {
      return "Entire League";
    }

    const divisions = targeting.filter(t => t.division).map(t => t.division!.name);
    const teams = targeting.filter(t => t.team).map(t => t.team!.name);

    const parts = [];
    if (divisions.length > 0) {
      parts.push(`Divisions: ${divisions.join(", ")}`);
    }
    if (teams.length > 0) {
      parts.push(`Teams: ${teams.join(", ")}`);
    }

    return parts.join(" • ");
  };

  if (loading && messages.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <Typography>Loading messages...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Box display="flex" gap={2} mb={3}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Message Type</InputLabel>
          <Select
            value={messageTypeFilter}
            label="Message Type"
            onChange={(e) => {
              setMessageTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="MESSAGE">Messages</MenuItem>
            <MenuItem value="ANNOUNCEMENT">Announcements</MenuItem>
          </Select>
        </FormControl>

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
            <MenuItem value="LOW">Low</MenuItem>
            <MenuItem value="NORMAL">Normal</MenuItem>
            <MenuItem value="HIGH">High</MenuItem>
            <MenuItem value="URGENT">Urgent</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {messages.length === 0 && !loading ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" textAlign="center">
              No messages found
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {messages.map((message) => (
            <Card key={message.id} variant="outlined">
              <CardContent>
                <Box display="flex" justifyContent="between" alignItems="flex-start" mb={2}>
                  <Box flex={1}>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      {message.messageType === "ANNOUNCEMENT" ? (
                        <CampaignIcon color="primary" fontSize="small" />
                      ) : (
                        <MessageIcon color="action" fontSize="small" />
                      )}
                      <Typography variant="h6" component="h3">
                        {message.subject}
                      </Typography>
                      <Chip
                        label={message.priority}
                        color={getPriorityColor(message.priority)}
                        size="small"
                      />
                    </Box>

                    <Box display="flex" alignItems="center" gap={2} mb={1}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {message.sender.name || message.sender.email}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(message.createdAt)}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <GroupIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {message.recipientCount} recipients
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {getTargetingDescription(message.targeting)}
                      </Typography>
                    </Box>
                  </Box>

                  <IconButton
                    onClick={() => handleExpandMessage(message.id)}
                    size="small"
                  >
                    {expandedMessage === message.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>

                <Collapse in={expandedMessage === message.id}>
                  <Divider sx={{ mb: 2 }} />
                  <Box>
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                      {message.content}
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
          Showing {messages.length} of {total} messages
        </Typography>
      )}
    </Box>
  );
};