"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import { addEventManager, removeEventManager } from "@/lib/actions/event-managers";
import { formatDateTime } from "@/lib/utils/date";

type Manager = {
  id: string;
  createdAt: Date;
  user: { id: string; name: string | null; email: string };
  grantedBy: { name: string | null; email: string };
};

interface ManagerPanelProps {
  eventId: string;
  managers: Manager[];
  /** Only host-entity admins may grant/revoke; managers see the list read-only. */
  canManageGrants: boolean;
}

export function ManagerPanel({ eventId, managers, canManageGrants }: ManagerPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!email.trim()) return;
    startTransition(async () => {
      setMessage(null);
      const result = await addEventManager({ eventId, email: email.trim() });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setMessage({ severity: "success", text: "Manager added." });
      setEmail("");
      router.refresh();
    });
  };

  const handleRemove = (manager: Manager) => {
    if (!window.confirm(`Remove ${manager.user.name ?? manager.user.email} as an event manager?`)) {
      return;
    }
    startTransition(async () => {
      setMessage(null);
      const result = await removeEventManager({ managerId: manager.id });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Event managers</Typography>
      <Typography variant="body2" color="text.secondary">
        Delegate day-to-day management (roster, waitlist, check-in, payments tracking, teams) to a
        coordinator — like a mite delegate — without giving them organization-wide access.
      </Typography>
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {canManageGrants ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            label="Add manager by email"
            type="email"
            fullWidth
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={handleAdd}
            disabled={isPending || !email.trim()}
            sx={{ whiteSpace: "nowrap" }}
          >
            {isPending ? "Adding…" : "Add manager"}
          </Button>
        </Stack>
      ) : null}

      {managers.length === 0 ? (
        <Typography color="text.secondary">
          No delegated managers — host admins manage this event.
        </Typography>
      ) : (
        <List dense disablePadding>
          {managers.map((manager) => (
            <ListItem
              key={manager.id}
              disableGutters
              secondaryAction={
                canManageGrants ? (
                  <Tooltip title="Remove manager">
                    <IconButton
                      edge="end"
                      size="small"
                      disabled={isPending}
                      aria-label={`Remove ${manager.user.name ?? manager.user.email}`}
                      onClick={() => handleRemove(manager)}
                    >
                      <PersonRemoveIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : undefined
              }
            >
              <ListItemText
                primary={manager.user.name ?? manager.user.email}
                secondary={`${manager.user.email} · added ${formatDateTime(manager.createdAt)} by ${
                  manager.grantedBy.name ?? manager.grantedBy.email
                }`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}
