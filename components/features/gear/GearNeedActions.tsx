"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack } from "@mui/material";
import {
  approveTeamGearNeed,
  cancelTeamGearNeed,
  fulfillTeamGearNeed,
  submitTeamGearNeed,
} from "@/lib/actions/gear-needs";

type NeedStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "FULFILLED" | "CANCELED";

export function GearNeedActions({
  leagueId,
  needId,
  expectedVersion,
  status,
  capabilities,
}: {
  leagueId: string;
  needId: string;
  expectedVersion: number;
  status: NeedStatus;
  capabilities: {
    canSubmit: boolean;
    canCancel: boolean;
    canApprove: boolean;
    canFulfill: boolean;
  };
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function transition(action: "submit" | "approve" | "fulfill" | "cancel") {
    setPending(true);
    setMessage(null);
    const input = { leagueId, needId, expectedVersion };
    const result = await ({
      submit: submitTeamGearNeed,
      approve: approveTeamGearNeed,
      fulfill: fulfillTeamGearNeed,
      cancel: cancelTeamGearNeed,
    })[action](input);
    setPending(false);
    if (result.success) {
      setMessage("Need updated.");
      router.refresh();
    } else {
      setMessage(result.error);
    }
  }

  if (status === "FULFILLED" || status === "CANCELED") return null;

  return (
    <Stack spacing={1}>
      {message && <Alert severity={message.startsWith("Need updated") ? "success" : "error"}>{message}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {capabilities.canSubmit && (
          <Button variant="contained" disabled={pending} onClick={() => transition("submit")} sx={{ minHeight: 44 }}>
            Submit need
          </Button>
        )}
        {capabilities.canApprove && (
          <Button variant="contained" disabled={pending} onClick={() => transition("approve")} sx={{ minHeight: 44 }}>
            Approve need
          </Button>
        )}
        {capabilities.canFulfill && (
          <Button variant="contained" disabled={pending} onClick={() => transition("fulfill")} sx={{ minHeight: 44 }}>
            Mark fulfilled
          </Button>
        )}
        {capabilities.canCancel && (
          <Button color="inherit" disabled={pending} onClick={() => transition("cancel")} sx={{ minHeight: 44 }}>
            Cancel need
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
