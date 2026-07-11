"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { inviteVenueStaff, removeStaff, updateStaffRole } from "@/lib/actions/venue-staff";
import { InviteResponseButtons } from "../../InviteResponseButtons";

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "MANAGER", label: "Manager" },
  { value: "SCHEDULER", label: "Scheduler" },
  { value: "CONTENT_EDITOR", label: "Content editor" },
  { value: "REQUEST_MANAGER", label: "Request manager" },
  { value: "VIEWER", label: "Viewer" },
] as const;

type VenueStaffRoleValue = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_LABELS: Record<VenueStaffRoleValue, string> = Object.fromEntries(
  ROLE_OPTIONS.map((option) => [option.value, option.label])
) as Record<VenueStaffRoleValue, string>;

export interface StaffMemberSummary {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: VenueStaffRoleValue;
  status: "ACTIVE" | "INVITED";
  /** ISO string when the member accepted, null while invited. */
  joinedAt: string | null;
  invitedByName: string | null;
  /** Set when the row is scoped to a single venue rather than org-wide. */
  venueName: string | null;
}

interface StaffManagerProps {
  organizationId: string;
  staff: StaffMemberSummary[];
  viewerUserId: string;
  /** Viewer is an ACTIVE OWNER or MANAGER: may invite. */
  canManage: boolean;
  /** Viewer is an ACTIVE OWNER: may change roles, remove staff, grant OWNER. */
  isOwner: boolean;
}

type FormMessage = { severity: "success" | "error"; text: string };

export function StaffManager({
  organizationId,
  staff,
  viewerUserId,
  canManage,
  isOwner,
}: StaffManagerProps) {
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<VenueStaffRoleValue>("VIEWER");
  const [isPending, startTransition] = useTransition();

  const viewerInvite = staff.find(
    (member) => member.userId === viewerUserId && member.status === "INVITED"
  );
  // MANAGERs may invite, but only OWNERs can grant the OWNER role.
  const inviteRoleOptions = isOwner
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== "OWNER");

  const openInviteDialog = () => {
    setInviteError(null);
    setInviteRole("VIEWER");
    setInviteOpen(true);
  };

  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    startTransition(async () => {
      setInviteError(null);
      const result = await inviteVenueStaff({ organizationId, email, role: inviteRole });
      if (result.success) {
        setInviteOpen(false);
        setMessage({ severity: "success", text: `Invitation sent to ${email}.` });
        return;
      }
      setInviteError(result.error);
    });
  };

  const handleRoleChange = (staffId: string, role: VenueStaffRoleValue) => {
    startTransition(async () => {
      setMessage(null);
      const result = await updateStaffRole({ organizationId, staffId, role });
      setMessage(
        result.success
          ? { severity: "success", text: "Role updated." }
          : { severity: "error", text: result.error }
      );
    });
  };

  const handleRemove = (member: StaffMemberSummary) => {
    const label = member.name || member.email;
    const verb = member.status === "INVITED" ? "Revoke the invitation for" : "Remove";
    if (!window.confirm(`${verb} ${label}?`)) {
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const result = await removeStaff({ organizationId, staffId: member.id });
      setMessage(
        result.success
          ? { severity: "success", text: `${label} removed.` }
          : { severity: "error", text: result.error }
      );
    });
  };

  return (
    <Stack spacing={2}>
      {viewerInvite ? (
        <Alert severity="info">
          <Stack spacing={1} alignItems="flex-start">
            <Typography variant="body2">
              You&apos;ve been invited to join this organization as{" "}
              <strong>{ROLE_LABELS[viewerInvite.role]}</strong>.
            </Typography>
            <InviteResponseButtons staffId={viewerInvite.id} />
          </Stack>
        </Alert>
      ) : null}

      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {canManage ? (
        <Box>
          <Button
            variant="contained"
            startIcon={<PersonAddAltIcon />}
            onClick={openInviteDialog}
            disabled={isPending}
          >
            Invite staff
          </Button>
        </Box>
      ) : null}

      {staff.length === 0 ? (
        <EmptyState
          icon={<PersonAddAltIcon />}
          title="No staff members yet"
          description="Invite a colleague with an OpenLeague account to help manage this organization."
        />
      ) : (
        <Stack spacing={1.5}>
          {staff.map((member) => (
            <Card key={member.id}>
              <CardContent>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ sm: "center" }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle1">
                      {member.name || member.email}
                      {member.userId === viewerUserId ? " (you)" : ""}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {member.email}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={ROLE_LABELS[member.role]} color="primary" variant="outlined" />
                      <Chip
                        size="small"
                        label={member.status === "ACTIVE" ? "Active" : "Invited"}
                        color={member.status === "ACTIVE" ? "success" : "default"}
                        variant={member.status === "ACTIVE" ? "filled" : "outlined"}
                      />
                      {member.venueName ? (
                        <Chip size="small" label={member.venueName} variant="outlined" />
                      ) : null}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      {member.status === "ACTIVE" && member.joinedAt
                        ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
                        : member.invitedByName
                          ? `Invited by ${member.invitedByName}`
                          : "Invitation pending"}
                    </Typography>
                  </Box>

                  {isOwner ? (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                      <TextField
                        select
                        size="small"
                        label="Role"
                        value={member.role}
                        onChange={(event) =>
                          handleRoleChange(member.id, event.target.value as VenueStaffRoleValue)
                        }
                        disabled={isPending}
                        sx={{ minWidth: 180 }}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Button
                        color="error"
                        size="small"
                        disabled={isPending}
                        onClick={() => handleRemove(member)}
                      >
                        {member.status === "INVITED" ? "Revoke" : "Remove"}
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} fullWidth maxWidth="xs">
        <Dialog.Title>Invite staff</Dialog.Title>
        <Box component="form" onSubmit={handleInvite}>
          <Dialog.Content>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                The person must already have an OpenLeague account. They&apos;ll get an email and
                can accept the invitation from this page.
              </Typography>
              {inviteError ? <Alert severity="error">{inviteError}</Alert> : null}
              <TextField label="Email" name="email" type="email" required autoFocus />
              <TextField
                select
                label="Role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as VenueStaffRoleValue)}
              >
                {inviteRoleOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onClick={() => setInviteOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isPending}>
              {isPending ? "Sending…" : "Send invitation"}
            </Button>
          </Dialog.Actions>
        </Box>
      </Dialog>
    </Stack>
  );
}
