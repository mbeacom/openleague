"use client";

import {
  Alert,
  Typography,
  Stack,
  Chip,
  Button,
  Box,
  Divider,
} from "@mui/material";
import { Warning, Schedule, AdminPanelSettings } from "@mui/icons-material";

interface SchedulingConflict {
  teamId: string;
  teamName: string;
  conflictingEvent: {
    id: string;
    title: string;
    startAt: Date;
  };
}

interface TimeSlotSuggestion {
  startAt: Date;
  reason: string;
}

interface ConflictWarningProps {
  conflicts: SchedulingConflict[];
  suggestions?: TimeSlotSuggestion[];
  canOverride?: boolean;
  onSuggestionSelect?: (suggestion: TimeSlotSuggestion) => void;
  onOverrideConflicts?: () => void;
  isOverriding?: boolean;
}

export default function ConflictWarning({
  conflicts,
  suggestions = [],
  canOverride = false,
  onSuggestionSelect,
  onOverrideConflicts,
  isOverriding = false,
}: ConflictWarningProps) {
  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <Alert 
      severity="warning" 
      icon={<Warning />}
      sx={{ mb: 2 }}
    >
      <Typography variant="subtitle2" gutterBottom>
        <strong>Scheduling Conflicts Detected</strong>
      </Typography>
      
      <Stack spacing={1} sx={{ mb: 2 }}>
        {conflicts.map((conflict, index) => (
          <Box key={index} sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
            <Typography variant="body2" color="warning.contrastText">
              <strong>{conflict.teamName}</strong> has a conflict:
            </Typography>
            <Typography variant="body2" color="warning.contrastText">
              {conflict.conflictingEvent.title} at {formatDateTime(conflict.conflictingEvent.startAt)}
            </Typography>
          </Box>
        ))}
      </Stack>

      {suggestions.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Schedule fontSize="small" />
            Suggested Alternative Times:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
            {suggestions.map((suggestion, index) => (
              <Chip
                key={index}
                label={`${formatDateTime(suggestion.startAt)} (${suggestion.reason})`}
                variant="outlined"
                color="primary"
                clickable
                onClick={() => onSuggestionSelect?.(suggestion)}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>
        </>
      )}

      {canOverride && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AdminPanelSettings fontSize="small" color="action" />
            <Typography variant="body2" sx={{ flex: 1 }}>
              As a league admin, you can override these conflicts if necessary.
            </Typography>
            <Button
              variant="outlined"
              color="warning"
              size="small"
              onClick={onOverrideConflicts}
              disabled={isOverriding}
            >
              {isOverriding ? "Overriding..." : "Override Conflicts"}
            </Button>
          </Box>
        </>
      )}

      {!canOverride && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please choose a different time or contact your league admin to override these conflicts.
        </Typography>
      )}
    </Alert>
  );
}