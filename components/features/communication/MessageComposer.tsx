"use client";

import React, { useState, useTransition } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from "@mui/material";
import { Send as SendIcon, Close as CloseIcon } from "@mui/icons-material";
import { sendLeagueMessage } from "@/lib/actions/communication";
import type { SendLeagueMessageInput } from "@/lib/utils/validation";

interface MessageComposerProps {
  open: boolean;
  onClose: () => void;
  leagueId: string;
  leagueName: string;
  divisions: Array<{
    id: string;
    name: string;
    teamCount: number;
  }>;
  teams: Array<{
    id: string;
    name: string;
    divisionName?: string;
    memberCount: number;
  }>;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  open,
  onClose,
  leagueId,
  divisions = [],
  teams = [],
}) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [messageType, setMessageType] = useState<"MESSAGE" | "ANNOUNCEMENT">("MESSAGE");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [targetingType, setTargetingType] = useState<"league" | "divisions" | "teams">("league");
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const handleReset = () => {
    setSubject("");
    setContent("");
    setMessageType("MESSAGE");
    setPriority("NORMAL");
    setTargetingType("league");
    setSelectedDivisions([]);
    setSelectedTeams([]);
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleDivisionChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setSelectedDivisions(typeof value === "string" ? value.split(",") : value);
  };

  const handleTeamChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setSelectedTeams(typeof value === "string" ? value.split(",") : value);
  };

  const getRecipientCount = (): number => {
    if (targetingType === "league") {
      return teams.reduce((sum, team) => sum + team.memberCount, 0);
    } else if (targetingType === "divisions") {
      const selectedDivisionTeams = teams.filter(team =>
        selectedDivisions.some(divId =>
          divisions.find(div => div.id === divId)?.name === team.divisionName
        )
      );
      return selectedDivisionTeams.reduce((sum, team) => sum + team.memberCount, 0);
    } else {
      const selectedTeamObjects = teams.filter(team => selectedTeams.includes(team.id));
      return selectedTeamObjects.reduce((sum, team) => sum + team.memberCount, 0);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!subject.trim() || !content.trim()) {
      setError("Subject and content are required");
      return;
    }

    if (targetingType !== "league" && targetingType === "divisions" && selectedDivisions.length === 0) {
      setError("Please select at least one division");
      return;
    }

    if (targetingType !== "league" && targetingType === "teams" && selectedTeams.length === 0) {
      setError("Please select at least one team");
      return;
    }

    const messageData: SendLeagueMessageInput = {
      leagueId,
      subject: subject.trim(),
      content: content.trim(),
      messageType,
      priority,
      targeting: {
        entireLeague: targetingType === "league",
        divisionIds: targetingType === "divisions" ? selectedDivisions : undefined,
        teamIds: targetingType === "teams" ? selectedTeams : undefined,
      },
    };

    startTransition(async () => {
      try {
        const result = await sendLeagueMessage(messageData);

        if (result.success) {
          setSuccess(`Message sent successfully to ${result.data.recipientCount} recipients`);
          setTimeout(() => {
            handleClose();
          }, 2000);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Failed to send message. Please try again.");
      }
    });
  };

  const recipientCount = getRecipientCount();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "600px" }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {messageType === "ANNOUNCEMENT" ? "Send League Announcement" : "Send League Message"}
          </Typography>
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

            {/* Message Type and Priority */}
            <Box display="flex" gap={2}>
              <FormControl fullWidth>
                <InputLabel>Message Type</InputLabel>
                <Select
                  value={messageType}
                  label="Message Type"
                  onChange={(e) => setMessageType(e.target.value as "MESSAGE" | "ANNOUNCEMENT")}
                >
                  <MenuItem value="MESSAGE">Targeted Message</MenuItem>
                  <MenuItem value="ANNOUNCEMENT">League Announcement</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={priority}
                  label="Priority"
                  onChange={(e) => setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH" | "URGENT")}
                >
                  <MenuItem value="LOW">Low</MenuItem>
                  <MenuItem value="NORMAL">Normal</MenuItem>
                  <MenuItem value="HIGH">High</MenuItem>
                  <MenuItem value="URGENT">Urgent</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Subject */}
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              required
              inputProps={{ maxLength: 200 }}
              helperText={`${subject.length}/200 characters`}
            />

            {/* Content */}
            <TextField
              label="Message Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              required
              multiline
              rows={6}
              inputProps={{ maxLength: 5000 }}
              helperText={`${content.length}/5000 characters`}
            />

            <Divider />

            {/* Targeting */}
            <Box>
              <FormControl component="fieldset">
                <FormLabel component="legend">Send To</FormLabel>
                <RadioGroup
                  value={targetingType}
                  onChange={(e) => setTargetingType(e.target.value as "league" | "divisions" | "teams")}
                >
                  <FormControlLabel
                    value="league"
                    control={<Radio />}
                    label={`Entire League (${teams.reduce((sum, team) => sum + team.memberCount, 0)} members)`}
                  />
                  <FormControlLabel
                    value="divisions"
                    control={<Radio />}
                    label="Specific Divisions"
                  />
                  <FormControlLabel
                    value="teams"
                    control={<Radio />}
                    label="Specific Teams"
                  />
                </RadioGroup>
              </FormControl>

              {/* Division Selection */}
              {targetingType === "divisions" && (
                <Box mt={2}>
                  <FormControl fullWidth>
                    <InputLabel>Select Divisions</InputLabel>
                    <Select
                      multiple
                      value={selectedDivisions}
                      onChange={handleDivisionChange}
                      label="Select Divisions"
                      renderValue={(selected) => (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {selected.map((value) => {
                            const division = divisions.find(d => d.id === value);
                            return (
                              <Chip
                                key={value}
                                label={`${division?.name} (${division?.teamCount} teams)`}
                                size="small"
                              />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {divisions.map((division) => (
                        <MenuItem key={division.id} value={division.id}>
                          {division.name} ({division.teamCount} teams)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Team Selection */}
              {targetingType === "teams" && (
                <Box mt={2}>
                  <FormControl fullWidth>
                    <InputLabel>Select Teams</InputLabel>
                    <Select
                      multiple
                      value={selectedTeams}
                      onChange={handleTeamChange}
                      label="Select Teams"
                      renderValue={(selected) => (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {selected.map((value) => {
                            const team = teams.find(t => t.id === value);
                            return (
                              <Chip
                                key={value}
                                label={`${team?.name} (${team?.memberCount} members)`}
                                size="small"
                              />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {teams.map((team) => (
                        <MenuItem key={team.id} value={team.id}>
                          {team.name}
                          {team.divisionName && ` - ${team.divisionName}`}
                          {` (${team.memberCount} members)`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Recipient Summary */}
              <Box mt={2}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      This message will be sent to <strong>{recipientCount}</strong> recipients
                      {priority === "URGENT" && (
                        <Chip
                          label="URGENT"
                          color="error"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      )}
                      {priority === "HIGH" && (
                        <Chip
                          label="HIGH PRIORITY"
                          color="warning"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
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
            disabled={isPending || !subject.trim() || !content.trim() || recipientCount === 0}
            startIcon={<SendIcon />}
          >
            {isPending ? "Sending..." : "Send Message"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};