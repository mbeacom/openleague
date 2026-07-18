"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { sendTeamMessage } from "@/lib/actions/communication";

interface TeamMessageComposerProps {
  teamId: string;
  memberCount: number;
}

export default function TeamMessageComposer({ teamId, memberCount }: TeamMessageComposerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!subject.trim() || !content.trim()) {
      setError("Subject and message are required");
      return;
    }
    startTransition(async () => {
      const result = await sendTeamMessage({
        teamId,
        subject: subject.trim(),
        content: content.trim(),
        messageType: "MESSAGE",
        priority,
      });
      if (result.success) {
        setSuccess(`Message sent to ${result.data.recipientCount} team member${result.data.recipientCount === 1 ? "" : "s"}.`);
        setSubject("");
        setContent("");
        setPriority("NORMAL");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Message your team
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Send an announcement to all {memberCount} member{memberCount === 1 ? "" : "s"} of this team.
          Members who have turned off message emails won&apos;t be emailed.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="team-msg-priority">Priority</InputLabel>
              <Select
                labelId="team-msg-priority"
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
              >
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="NORMAL">Normal</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="URGENT">Urgent</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              required
              slotProps={{ htmlInput: { maxLength: 200 } }}
              helperText={`${subject.length}/200`}
            />
            <TextField
              label="Message"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              required
              multiline
              rows={6}
              slotProps={{ htmlInput: { maxLength: 5000 } }}
              helperText={`${content.length}/5000`}
            />
            <Box>
              <Button
                type="submit"
                variant="contained"
                startIcon={<SendIcon />}
                disabled={isPending || memberCount === 0 || !subject.trim() || !content.trim()}
              >
                {isPending ? "Sending..." : "Send to team"}
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
