"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { AssociationRole, AssociationRoleScopeType } from "@prisma/client";

import { ROLE_CAPABILITY_MATRIX } from "@/lib/auth/capability-matrix";
import type { ResponsibilityGrantRow } from "@/lib/actions/association-roles";
import {
  inviteAssociationOperator,
  revokeAssociationResponsibility,
} from "@/lib/actions/association-roles";

/**
 * Roles this form offers today.
 *
 * The server matrix knows all ten, but a grant only *does* something where the
 * work has been routed through capability checks. As of feature 007 US3 that is
 * gear (equipment manager, association admin), volunteers (coordinator, team
 * manager, association admin), and delegation itself. Scheduling, registration,
 * finance, communications, and event administration still guard on the legacy
 * league/team roles, so offering those here would hand out responsibilities
 * that silently do nothing. They are re-enabled as each action set is wired.
 */
const OFFERED_ROLES: AssociationRole[] = [
  "ASSOCIATION_ADMIN",
  "TEAM_MANAGER",
  "VOLUNTEER_COORDINATOR",
  "EQUIPMENT_MANAGER",
];

/** Scopes this form can supply a target for. */
const SELECTABLE_SCOPES: AssociationRoleScopeType[] = ["ASSOCIATION", "DIVISION", "TEAM"];

const ROLE_LABELS: Record<AssociationRole, string> = {
  ASSOCIATION_ADMIN: "Association admin",
  SCHEDULER: "Scheduler",
  REGISTRAR: "Registrar",
  TREASURER: "Treasurer",
  COMMUNICATIONS_LEAD: "Communications lead",
  TEAM_MANAGER: "Team manager",
  COACH: "Coach",
  VOLUNTEER_COORDINATOR: "Volunteer coordinator",
  EVENT_MANAGER: "Event manager",
  EQUIPMENT_MANAGER: "Equipment manager",
};

const SCOPE_LABELS: Record<AssociationRoleScopeType, string> = {
  ASSOCIATION: "Entire association",
  DIVISION: "One division",
  TEAM: "One team",
  SEASON: "One season",
  EVENT: "One event",
  SIGNUP_EVENT: "One signup event",
};

/**
 * What each role actually lets somebody do, in the administrator's language.
 * Shown before they delegate, because "Registrar" means nothing on its own and
 * over-granting is the failure this whole feature exists to prevent.
 */
const ROLE_GUIDANCE: Record<AssociationRole, string> = {
  ASSOCIATION_ADMIN:
    "Delegation, volunteers, and gear across the whole association. Grant sparingly. Note that scheduling, registration, and finance still follow league admin membership, not this grant.",
  SCHEDULER: "Ice requests, reservations, schedules, games, and practices.",
  REGISTRAR: "Rosters, placements, and registration eligibility and reporting.",
  TREASURER: "Payments, refunds, and financial reports.",
  COMMUNICATIONS_LEAD: "Public content and operational messages.",
  TEAM_MANAGER:
    "Volunteers and gear needs/requests for one team. Roster, event, and practice administration still follow team admin membership.",
  COACH: "Practice plans and practice participation for one team.",
  VOLUNTEER_COORDINATOR:
    "Volunteer needs and assignments within the scope you choose, and nothing else.",
  EVENT_MANAGER: "One exact event, without wider association access.",
  EQUIPMENT_MANAGER:
    "Gear only — inventory and the public wishlist at association scope, and team gear needs and requests within the scope you choose. Confers no scheduling, finance, or administrative access.",
};

export interface RoleGrantManagerProps {
  leagueId: string;
  grants: ResponsibilityGrantRow[];
  divisions: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
}

export function RoleGrantManager({
  leagueId,
  grants,
  divisions,
  teams,
}: RoleGrantManagerProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssociationRole>("TEAM_MANAGER");
  const [scopeType, setScopeType] = useState<AssociationRoleScopeType>("TEAM");
  const [scopeId, setScopeId] = useState("");

  // Only offer scopes the chosen role supports. Offering the rest would let an
  // administrator build a combination the server refuses, which reads as a bug
  // rather than as the intended least-privilege boundary.
  const allowedScopes = useMemo(
    () =>
      (ROLE_CAPABILITY_MATRIX[role]?.scopes ?? []).filter((scope) =>
        SELECTABLE_SCOPES.includes(scope),
      ),
    [role],
  );

  const scopeOptions =
    scopeType === "DIVISION" ? divisions : scopeType === "TEAM" ? teams : [];

  function handleRoleChange(next: AssociationRole) {
    setRole(next);
    const scopes = (ROLE_CAPABILITY_MATRIX[next]?.scopes ?? []).filter((scope) =>
      SELECTABLE_SCOPES.includes(scope),
    );
    if (!scopes.includes(scopeType)) {
      setScopeType(scopes[0] ?? "ASSOCIATION");
      setScopeId("");
    }
  }

  function handleInvite() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await inviteAssociationOperator({
        leagueId,
        email,
        role,
        scopeType,
        ...(scopeType === "DIVISION" ? { divisionId: scopeId } : {}),
        ...(scopeType === "TEAM" ? { teamId: scopeId } : {}),
      });

      if (result.success) {
        setNotice(`Invitation sent to ${email}.`);
        setEmail("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleRevoke(grantId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await revokeAssociationResponsibility({ grantId, leagueId });
      if (!result.success) setError(result.error);
    });
  }

  const needsScopeTarget = scopeType === "DIVISION" || scopeType === "TEAM";

  return (
    <Stack spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Delegate a responsibility
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            fullWidth
            helperText="They will be invited if they do not already have an account."
          />

          <TextField
            select
            label="Responsibility"
            value={role}
            onChange={(event) => handleRoleChange(event.target.value as AssociationRole)}
            fullWidth
          >
            {OFFERED_ROLES.map((option) => (
              <MenuItem key={option} value={option}>
                {ROLE_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          <Alert severity="info" icon={false}>
            {ROLE_GUIDANCE[role]}
          </Alert>

          <TextField
            select
            label="Scope"
            value={scopeType}
            onChange={(event) => {
              setScopeType(event.target.value as AssociationRoleScopeType);
              setScopeId("");
            }}
            fullWidth
          >
            {allowedScopes.map((option) => (
              <MenuItem key={option} value={option}>
                {SCOPE_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          {needsScopeTarget ? (
            <TextField
              select
              label={scopeType === "DIVISION" ? "Division" : "Team"}
              value={scopeId}
              onChange={(event) => setScopeId(event.target.value)}
              fullWidth
            >
              {scopeOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <Box>
            <Button
              variant="contained"
              onClick={handleInvite}
              disabled={pending || !email || (needsScopeTarget && !scopeId)}
              sx={{ minHeight: 44 }}
            >
              Send invitation
            </Button>
          </Box>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Current responsibilities
        </Typography>

        {grants.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nobody has been delegated a responsibility yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Responsibility</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <Typography variant="body2">
                        {grant.user.name ?? grant.user.email}
                      </Typography>
                      {grant.user.name ? (
                        <Typography variant="caption" color="text.secondary">
                          {grant.user.email}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={ROLE_LABELS[grant.role]} />
                    </TableCell>
                    <TableCell>{grant.scopeLabel}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        disabled={pending}
                        onClick={() => handleRevoke(grant.id)}
                        sx={{ minHeight: 44 }}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>
    </Stack>
  );
}

export default RoleGrantManager;
