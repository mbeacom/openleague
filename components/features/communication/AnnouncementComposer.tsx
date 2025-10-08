"use client";

import React, { useState, useTransition } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  Divider,
  Chip,
} from "@mui/material";
import { Campaign as CampaignIcon, Close as CloseIcon } from "@mui/icons-material";
import { sendLeagueMessage } from "@/lib/actions/communication";
import type { SendLeagueMessageInput } from "@/lib/utils/validation";

interface AnnouncementComposerProps {
  open: boolean;
  onClose: () => void;
  leagueId: string;
  leagueName: string;
  totalMembers: number;
}

export const AnnouncementComposer: React.FC<AnnouncementComposerProps> = ({
  open,
  onClose,
  leagueId,
  leagueName,
  totalMembers,
}) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");

  const handleReset = () => {
    setSubject("");
    setContent("");
    setPriority("NORMAL");
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!subject.trim() || !content.trim()) {
      setError("Subject and content are required");
      return;
    }

    const announcementData: SendLeagueMessageInput = {
      leagueId,
      subject: subject.trim(),
      content: content.trim(),
      messageType: "ANNOUNCEMENT",
      priority,
      targeting: {
        entireLeague: true,
      },
    };

    startTransition(async () => {
      try {
        const result = await sendLeagueMessage(announcementData);

        if (result.success) {
          setSuccess(`Announcement sent successfully to ${result.data.recipientCount} members`);
          setTimeout(() => {
            handleClose();
          }, 2000);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Failed to send announcement. Please try again.");
      }
    });
  };

  const getPriorityDescription = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "🚨 Urgent announcements are highlighted prominently and marked as requiring immediate attention";
      case "HIGH":
        return "📢 High priority announcements are emphasized in emails and notifications";
      case "NORMAL":
        return "📝 Normal announcements are sent with standard formatting";
      case "LOW":
        return "ℹ️ Low priority announcements are sent with minimal emphasis";
      default:
        return "";
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "500px" }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <CampaignIcon color="primary" />
            <Typography variant="h6">
              Send League Announcement
            </Typography>
          </Box>
          <Button
            onClick={handleClose}
            size="small"
            sx={{ minWidth: "auto", p: 1 }}
          >
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={3}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" onClose={() => setSuccess(null)}>
                {success}
              </Alert>
            )}

            {/* Info Card */}
            <Card variant="outlined" sx={{ bgcolor: "primary.50" }}>
              <CardContent>
                <Typography variant="body2" color="primary.main">
                  📢 This announcement will be sent to all <strong>{totalMembers}</strong> members of {leagueName}
                </Typography>
              </CardContent>
            </Card>

            {/* Priority */}
            <FormControl fullWidth>
              <InputLabel>Priority Level</InputLabel>
              <Select
                value={priority}
                label="Priority Level"
                onChange={(e) => setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH" | "URGENT")}
              >
                <MenuItem value="LOW">Low Priority</MenuItem>
                <MenuItem value="NORMAL">Normal Priority</MenuItem>
                <MenuItem value="HIGH">High Priority</MenuItem>
                <MenuItem value="URGENT">Urgent</MenuItem>
              </Select>
            </FormControl>

            {/* Priority Description */}
            <Box>
              <Typography variant="body2" color="text.secondary">
                {getPriorityDescription(priority)}
              </Typography>
            </Box>

            {/* Subject */}
            <TextField
              label="Announcement Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              required
              inputProps={{ maxLength: 200 }}
              helperText={`${subject.length}/200 characters`}
              placeholder="e.g., Important Schedule Change, New League Policy, Upcoming Event"
            />

            {/* Content */}
            <TextField
              label="Announcement Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              required
              multiline
              rows={8}
              inputProps={{ maxLength: 5000 }}
              helperText={`${content.length}/5000 characters`}
              placeholder="Write your announcement here. Be clear and concise. Include any important dates, actions required, or contact information."
            />

            <Divider />

            {/* Preview */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Email Preview:
              </Typography>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <CampaignIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle1">
                      League Announcement
                    </Typography>
                    {priority !== "NORMAL" && (
                      <Chip
                        label={priority}
                        color={priority === "URGENT" ? "error" : priority === "HIGH" ? "warning" : "default"}
                        size="small"
                      />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    From League Admin • {leagueName}
                  </Typography>
                  <Typography variant="h6" mb={1}>
                    {subject || "Your announcement subject"}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {content || "Your announcement content will appear here..."}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isPending || !subject.trim() || !content.trim()}
            startIcon={<CampaignIcon />}
            color={priority === "URGENT" ? "error" : priority === "HIGH" ? "warning" : "primary"}
          >
            {isPending ? "Sending..." : "Send Announcement"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};