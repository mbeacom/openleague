"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  annotateIceTimeRequest,
  cancelIceTimeRequest,
  decideIceTimeRequest,
  expireIceTimeRequest,
} from "@/lib/actions/venue-requests";
import {
  formatDateTimeInZone,
  formatDateTimeLocalInput,
  parseDateTimeLocalToUtc,
} from "@/lib/utils/date";

interface SurfaceOption {
  id: string;
  name: string;
  wholeLabel: string;
  segments: Array<{ id: string; name: string }>;
}

interface RequestSummary {
  id: string;
  contactName: string;
  contactEmail: string;
  status: string;
  requestedStartAt: Date | string;
  requestedEndAt: Date | string;
  approvedStartAt?: Date | string | null;
  approvedEndAt?: Date | string | null;
  timezone?: string;
  requestedSurfaceId?: string | null;
  requestedSurfaceName?: string | null;
  requestedSegmentId?: string | null;
  requestedSegmentName?: string | null;
  approvedSurfaceId?: string | null;
  approvedSurfaceName?: string | null;
  approvedSegmentId?: string | null;
  approvedSegmentName?: string | null;
  reservation?: {
    id: string;
    status: string;
    venueName?: string | null;
    surfaceName?: string | null;
    segmentName?: string | null;
  } | null;
}

interface ApprovalDraft {
  requestId: string;
  approvedStart: string;
  approvedEnd: string;
  approvedSurfaceId: string;
  approvedSegmentId: string;
  intentionalVenueWideClaim: boolean;
  overrideConflicts: boolean;
  overrideReason: string;
}

function toLocalInput(value: Date | string, timezone: string) {
  return formatDateTimeLocalInput(new Date(value), timezone);
}

function resolveTimeZone(venueTimeZone: string | undefined, request: RequestSummary) {
  return request.timezone ?? venueTimeZone ?? "America/New_York";
}

function formatInterval(startAt: Date | string, endAt: Date | string, timeZone: string) {
  return `${formatDateTimeInZone(startAt, timeZone)} – ${formatDateTimeInZone(endAt, timeZone)}`;
}

function requestedSpaceLabel(request: RequestSummary) {
  if (!request.requestedSurfaceId) return "Venue-wide";
  if (request.requestedSegmentName) {
    return `${request.requestedSurfaceName ?? "Surface"} / ${request.requestedSegmentName}`;
  }
  return request.requestedSurfaceName ?? "Whole surface";
}

function approvedSpaceLabel(request: RequestSummary) {
  if (request.reservation) {
    if (!request.reservation.surfaceName) return "Venue-wide";
    if (request.reservation.segmentName) {
      return `${request.reservation.surfaceName} / ${request.reservation.segmentName}`;
    }
    return request.reservation.surfaceName;
  }
  if (request.approvedSurfaceId === null) return "Venue-wide";
  if (request.approvedSegmentName) {
    return `${request.approvedSurfaceName ?? "Surface"} / ${request.approvedSegmentName}`;
  }
  return request.approvedSurfaceName ?? null;
}

export function IceTimeRequestQueue({
  organizationId,
  venueId,
  venueName,
  venueTimeZone,
  surfaceOptions = [],
  requests,
}: {
  organizationId: string;
  venueId: string;
  venueName?: string;
  venueTimeZone?: string;
  surfaceOptions?: SurfaceOption[];
  requests: RequestSummary[];
}) {
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");
  const [noteByRequestId, setNoteByRequestId] = useState<Record<string, string>>({});
  const [unassignFor, setUnassignFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvalValidationError, setApprovalValidationError] = useState<string | null>(null);

  async function runDecision(
    request: RequestSummary,
    status: "ACCEPTED" | "PARTIALLY_ACCEPTED" | "DECLINED",
    extras: Record<string, unknown> = {},
  ) {
    setActionError(null);
    const result = await decideIceTimeRequest({
      organizationId,
      venueId,
      requestId: request.id,
      status,
      ...extras,
    });
    if (!result.success) {
      setActionError(result.error);
    }
    return result;
  }

  async function changeRequestStatus(
    request: RequestSummary,
    action: typeof cancelIceTimeRequest | typeof expireIceTimeRequest,
  ) {
    setActionError(null);
    const result = await action({
      organizationId,
      venueId,
      requestId: request.id,
      linkedActivityDisposition:
        unassignFor === request.id ? "UNASSIGN" : undefined,
    });
    if (!result.success) {
      setActionError(result.error);
    }
    return result;
  }

  function openApprovalEditor(request: RequestSummary) {
    const timeZone = resolveTimeZone(venueTimeZone, request);
    setActionError(null);
    setApprovalValidationError(null);
    setApprovalDraft({
      requestId: request.id,
      approvedStart: toLocalInput(
        request.approvedStartAt ?? request.requestedStartAt,
        timeZone,
      ),
      approvedEnd: toLocalInput(
        request.approvedEndAt ?? request.requestedEndAt,
        timeZone,
      ),
      approvedSurfaceId:
        request.status === "SUBMITTED" || request.status === "UNDER_REVIEW"
          ? (request.requestedSurfaceId ?? "")
          : (request.approvedSurfaceId ?? ""),
      approvedSegmentId:
        request.status === "SUBMITTED" || request.status === "UNDER_REVIEW"
          ? (request.requestedSegmentId ?? "")
          : (request.approvedSegmentId ?? ""),
      intentionalVenueWideClaim: false,
      overrideConflicts: false,
      overrideReason: "",
    });
  }

  const activeRequest = useMemo(
    () => requests.find((request) => request.id === approvalDraft?.requestId) ?? null,
    [approvalDraft, requests],
  );

  const activeTimeZone = activeRequest
    ? resolveTimeZone(venueTimeZone, activeRequest)
    : venueTimeZone ?? "America/New_York";
  const approvalSurfaceOptions = activeRequest?.requestedSurfaceId
    ? surfaceOptions.filter(
        (surface) => surface.id === activeRequest.requestedSurfaceId,
      )
    : surfaceOptions;
  const selectedSurface = approvalDraft
    ? approvalSurfaceOptions.find(
        (surface) => surface.id === approvalDraft.approvedSurfaceId,
      ) ?? null
    : null;
  const segmentOptions = activeRequest?.requestedSegmentId
    ? (selectedSurface?.segments ?? []).filter(
        (segment) => segment.id === activeRequest.requestedSegmentId,
      )
    : selectedSurface?.segments ?? [];
  const venueWideAllowed = activeRequest?.requestedSurfaceId == null;

  const approvalPreview = approvalDraft && activeRequest
    ? (() => {
        const approvedStartAt = parseDateTimeLocalToUtc(
          approvalDraft.approvedStart,
          activeTimeZone,
        );
        const approvedEndAt = parseDateTimeLocalToUtc(
          approvalDraft.approvedEnd,
          activeTimeZone,
        );
        const exactInterval =
          approvedStartAt?.getTime() === new Date(activeRequest.requestedStartAt).getTime()
          && approvedEndAt?.getTime() === new Date(activeRequest.requestedEndAt).getTime();
        const exactSpace =
          (approvalDraft.approvedSurfaceId || null) === (activeRequest.requestedSurfaceId ?? null)
          && (approvalDraft.approvedSegmentId || null) === (activeRequest.requestedSegmentId ?? null);
        return {
          exactInterval,
          exactSpace,
          finalStatus: exactInterval && exactSpace ? "ACCEPTED" : "PARTIALLY_ACCEPTED",
        };
      })()
    : null;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5">Request queue</Typography>
        {venueName ? (
          <Typography color="text.secondary" variant="body2">
            Times in this queue use {venueTimeZone ?? "the venue timezone"} for {venueName}.
          </Typography>
        ) : null}
      </Stack>
      {actionError ? <Alert severity="error">{actionError}</Alert> : null}
      {requests.length === 0 ? (
        <Typography color="text.secondary">No ice time requests yet.</Typography>
      ) : requests.map((request) => {
        const timeZone = resolveTimeZone(venueTimeZone, request);
        const isApproving = approvalDraft?.requestId === request.id;
        const isDeclining = declineFor === request.id;
        const approvalLabel = approvedSpaceLabel(request);

        return (
          <Card key={request.id}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6">{request.contactName}</Typography>
                  <Chip label={request.status} size="small" />
                </Stack>
                <Typography>{request.contactEmail}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Requested interval: {formatInterval(request.requestedStartAt, request.requestedEndAt, timeZone)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Requested space: {requestedSpaceLabel(request)}
                </Typography>
                {request.approvedStartAt && request.approvedEndAt && approvalLabel ? (
                  <Typography variant="body2">
                    Approved: {approvalLabel}, {formatInterval(request.approvedStartAt, request.approvedEndAt, timeZone)}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    sx={{ minHeight: 44 }}
                    variant="contained"
                    onClick={() => {
                      if ((request.requestedSurfaceId ?? null) === null) {
                        openApprovalEditor(request);
                        return;
                      }
                      void runDecision(request, "ACCEPTED", {
                        approvedStartAt: new Date(request.requestedStartAt),
                        approvedEndAt: new Date(request.requestedEndAt),
                        approvedSurfaceId: request.requestedSurfaceId ?? null,
                        approvedSegmentId: request.requestedSegmentId ?? null,
                      });
                    }}
                  >
                    Approve in full
                  </Button>
                  <Button sx={{ minHeight: 44 }} onClick={() => openApprovalEditor(request)}>
                    Partially approve
                  </Button>
                  <Button
                    sx={{ minHeight: 44 }}
                    color="warning"
                    onClick={() => {
                      setActionError(null);
                      setDeclineMessage("");
                      setDeclineFor(request.id);
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    sx={{ minHeight: 44 }}
                    color="error"
                    onClick={() => void changeRequestStatus(request, cancelIceTimeRequest)}
                  >
                    Cancel
                  </Button>
                  <Button
                    sx={{ minHeight: 44 }}
                    color="error"
                    variant="outlined"
                    onClick={() => void changeRequestStatus(request, expireIceTimeRequest)}
                  >
                    Expire
                  </Button>
                </Stack>
                {request.reservation ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={unassignFor === request.id}
                        onChange={(event) =>
                          setUnassignFor(event.target.checked ? request.id : null)
                        }
                        sx={{ minWidth: 44, minHeight: 44 }}
                      />
                    }
                    label="Unassign linked activity before canceling or expiring"
                  />
                ) : null}
                {isApproving && approvalDraft && activeRequest ? (
                  <Stack spacing={1.5} sx={{ pt: 1 }}>
                    <Alert severity={approvalPreview?.finalStatus === "ACCEPTED" ? "success" : "info"}>
                      {approvalPreview?.finalStatus === "ACCEPTED"
                        ? "These approved details exactly match the request and will stay a full acceptance."
                        : "Changing the interval or space makes this a partial acceptance."}
                    </Alert>
                    {approvalValidationError ? <Alert severity="error">{approvalValidationError}</Alert> : null}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField
                        fullWidth
                        label="Approved start"
                        type="datetime-local"
                        value={approvalDraft.approvedStart}
                        onChange={(event) => {
                          setApprovalValidationError(null);
                          setApprovalDraft((current) =>
                            current
                              ? { ...current, approvedStart: event.target.value }
                              : current,
                          );
                        }}
                        helperText={`Times are in ${activeTimeZone}`}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        fullWidth
                        label="Approved end"
                        type="datetime-local"
                        value={approvalDraft.approvedEnd}
                        onChange={(event) => {
                          setApprovalValidationError(null);
                          setApprovalDraft((current) =>
                            current
                              ? { ...current, approvedEnd: event.target.value }
                              : current,
                          );
                        }}
                        helperText={`Times are in ${activeTimeZone}`}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField
                        select
                        fullWidth
                        label="Approved surface"
                        value={approvalDraft.approvedSurfaceId}
                        onChange={(event) => {
                          setActionError(null);
                          setApprovalValidationError(null);
                          const nextSurfaceId = event.target.value;
                          setApprovalDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  approvedSurfaceId: nextSurfaceId,
                                  approvedSegmentId: "",
                                  intentionalVenueWideClaim:
                                    nextSurfaceId === "" ? current.intentionalVenueWideClaim : false,
                                }
                              : current,
                          );
                        }}
                      >
                        {venueWideAllowed ? (
                          <MenuItem value="">Venue-wide</MenuItem>
                        ) : null}
                        {approvalSurfaceOptions.map((surface) => (
                          <MenuItem key={surface.id} value={surface.id}>
                            {surface.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      {selectedSurface ? (
                        <TextField
                          select
                          fullWidth
                          label="Approved segment"
                          value={approvalDraft.approvedSegmentId}
                          onChange={(event) => {
                            setApprovalValidationError(null);
                            setApprovalDraft((current) =>
                              current
                                ? { ...current, approvedSegmentId: event.target.value }
                                : current,
                            );
                          }}
                          helperText={`Leave blank for ${selectedSurface.wholeLabel}.`}
                        >
                          {activeRequest.requestedSegmentId ? null : (
                            <MenuItem value="">{selectedSurface.wholeLabel}</MenuItem>
                          )}
                          {segmentOptions.map((segment) => (
                            <MenuItem key={segment.id} value={segment.id}>
                              {segment.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : venueWideAllowed ? (
                        <Box sx={{ flex: 1 }}>
                          <Alert severity="warning">
                            Venue-wide claims block every surface at this venue and require venue-manager authorization.
                          </Alert>
                        </Box>
                      ) : null}
                    </Stack>
                    {venueWideAllowed && approvalDraft.approvedSurfaceId === "" ? (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={approvalDraft.intentionalVenueWideClaim}
                            onChange={(event) =>
                              setApprovalDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      intentionalVenueWideClaim: event.target.checked,
                                    }
                                  : current,
                              )
                            }
                            sx={{ minWidth: 44, minHeight: 44 }}
                          />
                        }
                        label="I intentionally want a venue-wide claim that blocks every surface for this interval"
                      />
                    ) : null}
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={approvalDraft.overrideConflicts}
                          onChange={(event) =>
                            setApprovalDraft((current) =>
                              current
                                ? { ...current, overrideConflicts: event.target.checked }
                                : current,
                            )
                          }
                          sx={{ minWidth: 44, minHeight: 44 }}
                        />
                      }
                      label="Override conflicts if the final availability check finds a clash"
                    />
                    {(approvalDraft.overrideConflicts || approvalDraft.approvedSurfaceId === "") ? (
                      <TextField
                        fullWidth
                        label="Reason"
                        value={approvalDraft.overrideReason}
                        onChange={(event) => {
                          setApprovalValidationError(null);
                          setApprovalDraft((current) =>
                            current
                              ? { ...current, overrideReason: event.target.value }
                              : current,
                          );
                        }}
                        helperText={approvalDraft.approvedSurfaceId === ""
                          ? "Required for intentional venue-wide claims and reused if a conflict override is needed."
                          : "Required when overriding conflicts."}
                        multiline
                        minRows={2}
                      />
                    ) : null}
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button
                        sx={{ minHeight: 44 }}
                        variant="contained"
                        onClick={() => {
                          const approvedStartAt = parseDateTimeLocalToUtc(
                            approvalDraft.approvedStart,
                            activeTimeZone,
                          );
                          const approvedEndAt = parseDateTimeLocalToUtc(
                            approvalDraft.approvedEnd,
                            activeTimeZone,
                          );
                          if (!approvedStartAt || !approvedEndAt) {
                            setApprovalValidationError("Enter a valid approved interval.");
                            return;
                          }
                          if (
                            approvalDraft.approvedSurfaceId === ""
                            && !approvalDraft.intentionalVenueWideClaim
                          ) {
                            setApprovalValidationError(
                              "Confirm the intentional venue-wide claim before approving without a surface.",
                            );
                            return;
                          }
                          if (
                            (approvalDraft.overrideConflicts || approvalDraft.approvedSurfaceId === "")
                            && !approvalDraft.overrideReason.trim()
                          ) {
                            setApprovalValidationError("Enter a reason for this approval.");
                            return;
                          }
                          void runDecision(
                            activeRequest,
                            approvalPreview?.finalStatus === "ACCEPTED"
                              ? "ACCEPTED"
                              : "PARTIALLY_ACCEPTED",
                            {
                              approvedStartAt,
                              approvedEndAt,
                              approvedSurfaceId: approvalDraft.approvedSurfaceId || null,
                              approvedSegmentId: approvalDraft.approvedSegmentId || null,
                              intentionalVenueWideClaim:
                                approvalDraft.intentionalVenueWideClaim,
                              overrideConflicts: approvalDraft.overrideConflicts,
                              overrideReason: approvalDraft.overrideReason.trim() || undefined,
                            },
                          ).then((result) => {
                            if (result.success) {
                              setApprovalDraft(null);
                              setApprovalValidationError(null);
                            }
                          });
                        }}
                      >
                        {approvalPreview?.finalStatus === "ACCEPTED"
                          ? "Confirm full approval"
                          : "Confirm partial approval"}
                      </Button>
                      <Button
                        sx={{ minHeight: 44 }}
                        onClick={() => {
                          setApprovalDraft(null);
                          setApprovalValidationError(null);
                        }}
                      >
                        Cancel approval edit
                      </Button>
                    </Stack>
                  </Stack>
                ) : null}
                {isDeclining ? (
                  <Stack spacing={1}>
                    <TextField
                      label="Decision message"
                      value={declineMessage}
                      onChange={(event) => setDeclineMessage(event.target.value)}
                    />
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button
                        sx={{ minHeight: 44 }}
                        onClick={() => {
                          void runDecision(request, "DECLINED", {
                            decisionMessage: declineMessage,
                          }).then((result) => {
                            if (result.success) {
                              setDeclineFor(null);
                              setDeclineMessage("");
                            }
                          });
                        }}
                      >
                        Confirm decline
                      </Button>
                      <Button
                        sx={{ minHeight: 44 }}
                        onClick={() => {
                          setDeclineFor(null);
                          setDeclineMessage("");
                        }}
                      >
                        Cancel decline
                      </Button>
                    </Stack>
                  </Stack>
                ) : null}
                {request.status !== "SUBMITTED" ? (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                    <TextField
                      fullWidth
                      label="Internal note"
                      value={noteByRequestId[request.id] ?? ""}
                      onChange={(event) =>
                        setNoteByRequestId((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      sx={{ minHeight: 44, minWidth: { sm: 120 } }}
                      onClick={() => {
                        setActionError(null);
                        void annotateIceTimeRequest({
                          organizationId,
                          venueId,
                          requestId: request.id,
                          decisionMessage: noteByRequestId[request.id] ?? "",
                        }).then((result) => {
                          if (!result.success) setActionError(result.error);
                        });
                      }}
                    >
                      Save note
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
