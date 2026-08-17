import { ThemeProvider } from "@mui/material/styles";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IceTimeRequestQueue } from "@/components/features/venue-admin/IceTimeRequestQueue";
import theme from "@/lib/theme";

const {
  mockAnnotateIceTimeRequest,
  mockDecideIceTimeRequest,
  mockCancelIceTimeRequest,
  mockExpireIceTimeRequest,
} = vi.hoisted(() => ({
  mockAnnotateIceTimeRequest: vi.fn(),
  mockDecideIceTimeRequest: vi.fn(),
  mockCancelIceTimeRequest: vi.fn(),
  mockExpireIceTimeRequest: vi.fn(),
}));

vi.mock("@/lib/actions/venue-requests", () => ({
  annotateIceTimeRequest: (...args: unknown[]) => mockAnnotateIceTimeRequest(...args),
  decideIceTimeRequest: (...args: unknown[]) => mockDecideIceTimeRequest(...args),
  cancelIceTimeRequest: (...args: unknown[]) => mockCancelIceTimeRequest(...args),
  expireIceTimeRequest: (...args: unknown[]) => mockExpireIceTimeRequest(...args),
}));

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const SURFACE_A_ID = "csurf000000000000000000000";
const SURFACE_B_ID = "csurf111111111111111111111";
const SEGMENT_A_ID = "csegm000000000000000000000";
const SEGMENT_B_ID = "csegm111111111111111111111";

const SURFACE_OPTIONS = [
  {
    id: SURFACE_A_ID,
    name: "Rink A",
    wholeLabel: "Full Rink A",
    segments: [{ id: SEGMENT_A_ID, name: "Offensive Zone" }],
  },
  {
    id: SURFACE_B_ID,
    name: "Rink B",
    wholeLabel: "Full Rink B",
    segments: [{ id: SEGMENT_B_ID, name: "Studio Sheet" }],
  },
];

const PENDING_REQUEST = {
  id: "clreqxxxxxxxxxxxxxxxxxxxxxxx",
  contactName: "Coach One",
  contactEmail: "coach@example.com",
  status: "SUBMITTED",
  timezone: "America/New_York",
  requestedStartAt: new Date("2026-03-01T10:00:00Z"),
  requestedEndAt: new Date("2026-03-01T11:00:00Z"),
  requestedSurfaceId: SURFACE_A_ID,
  requestedSurfaceName: "Rink A",
  requestedSegmentId: SEGMENT_A_ID,
  requestedSegmentName: "Offensive Zone",
  approvedSurfaceId: null,
  approvedSegmentId: null,
};

const VENUE_WIDE_REQUEST = {
  ...PENDING_REQUEST,
  id: "clreqvenuewidexxxxxxxxxxxxx",
  requestedSurfaceId: null,
  requestedSurfaceName: null,
  requestedSegmentId: null,
  requestedSegmentName: null,
};

const ACCEPTED_REQUEST_WITH_RESERVATION = {
  id: "clreqacceptedxxxxxxxxxxxxxx",
  contactName: "Coach Two",
  contactEmail: "coach2@example.com",
  status: "PARTIALLY_ACCEPTED",
  timezone: "America/New_York",
  requestedStartAt: new Date("2026-03-02T10:00:00Z"),
  requestedEndAt: new Date("2026-03-02T11:00:00Z"),
  requestedSurfaceId: SURFACE_A_ID,
  requestedSurfaceName: "Rink A",
  requestedSegmentId: null,
  requestedSegmentName: null,
  approvedStartAt: new Date("2026-03-02T10:00:00Z"),
  approvedEndAt: new Date("2026-03-02T10:30:00Z"),
  approvedSurfaceId: SURFACE_B_ID,
  approvedSurfaceName: "Rink B",
  approvedSegmentId: SEGMENT_B_ID,
  approvedSegmentName: "Studio Sheet",
  reservation: {
    id: "clresxxxxxxxxxxxxxxxxxxxxxx",
    status: "CONFIRMED",
    venueName: "North Rink",
    surfaceName: "Rink B",
    segmentName: "Studio Sheet",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDecideIceTimeRequest.mockResolvedValue({
    success: true,
    data: { requestId: PENDING_REQUEST.id, status: "ACCEPTED", decidedAt: new Date() },
  });
  mockCancelIceTimeRequest.mockResolvedValue({
    success: true,
    data: { requestId: PENDING_REQUEST.id, status: "CANCELED" },
  });
  mockExpireIceTimeRequest.mockResolvedValue({
    success: true,
    data: { requestId: PENDING_REQUEST.id, status: "EXPIRED" },
  });
  mockAnnotateIceTimeRequest.mockResolvedValue({
    success: true,
    data: { requestId: PENDING_REQUEST.id, decisionMessage: "Saved" },
  });
});

describe("IceTimeRequestQueue", () => {
  it("renders baseline queue details and the empty state", () => {
    const { rerender } = renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[PENDING_REQUEST]}
      />,
    );

    expect(screen.getByText("Request queue")).toBeInTheDocument();
    expect(screen.getByText("Coach One")).toBeInTheDocument();
    expect(screen.getByText("coach@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Requested space: Rink A \/ Offensive Zone/)).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={theme}>
        <IceTimeRequestQueue
          organizationId={ORGANIZATION_ID}
          venueId={VENUE_ID}
          venueName="North Rink"
          venueTimeZone="America/New_York"
          surfaceOptions={SURFACE_OPTIONS}
          requests={[]}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("No ice time requests yet.")).toBeInTheDocument();
  });

  it("fully approves a request with the exact requested interval and space", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[PENDING_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve in full/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        venueId: VENUE_ID,
        requestId: PENDING_REQUEST.id,
        status: "ACCEPTED",
        approvedSurfaceId: SURFACE_A_ID,
        approvedSegmentId: SEGMENT_A_ID,
      }),
    );
    expect(mockDecideIceTimeRequest.mock.calls[0][0].approvedStartAt).toBeInstanceOf(Date);
    expect(mockDecideIceTimeRequest.mock.calls[0][0].approvedEndAt).toBeInstanceOf(Date);
  });

  it("shows partial/full semantics and limits a segment request to its exact requested space", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[PENDING_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /partially approve/i }));
    expect(screen.getByText(/will stay a full acceptance/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/approved end/i));
    await user.type(screen.getByLabelText(/approved end/i), "2026-03-01T10:30");
    expect(screen.getByText(/makes this a partial acceptance/i)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /approved surface/i }));
    expect(screen.queryByRole("option", { name: "Rink B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Venue-wide" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Rink A" }));
    await user.click(screen.getByRole("combobox", { name: /approved segment/i }));
    expect(screen.queryByRole("option", { name: "Full Rink A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Studio Sheet" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Offensive Zone" }));
    await user.click(screen.getByRole("button", { name: /confirm partial approval/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        venueId: VENUE_ID,
        requestId: PENDING_REQUEST.id,
        status: "PARTIALLY_ACCEPTED",
        approvedSurfaceId: SURFACE_A_ID,
        approvedSegmentId: SEGMENT_A_ID,
      }),
    );
  });

  it("allows a venue-wide request to narrow to any surface and segment", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[VENUE_WIDE_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /partially approve/i }));
    await user.click(screen.getByRole("combobox", { name: /approved surface/i }));
    await user.click(screen.getByRole("option", { name: "Rink B" }));
    await user.click(screen.getByRole("combobox", { name: /approved segment/i }));
    await user.click(screen.getByRole("option", { name: "Studio Sheet" }));
    await user.click(screen.getByRole("button", { name: /confirm partial approval/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedSurfaceId: SURFACE_B_ID,
        approvedSegmentId: SEGMENT_B_ID,
      }),
    );
  });

  it("allows a whole-surface request to narrow only within the same surface", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[{
          ...PENDING_REQUEST,
          requestedSegmentId: null,
          requestedSegmentName: null,
        }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /partially approve/i }));
    await user.click(screen.getByRole("combobox", { name: /approved surface/i }));
    expect(screen.queryByRole("option", { name: "Rink B" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Rink A" }));
    await user.click(screen.getByRole("combobox", { name: /approved segment/i }));
    expect(screen.getByRole("option", { name: "Full Rink A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Offensive Zone" })).toBeInTheDocument();
  });

  it("requires an intentional venue-wide claim confirmation and reason, then sends them to the action", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[VENUE_WIDE_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve in full/i }));
    await user.click(screen.getByRole("button", { name: /confirm full approval/i }));

    expect(screen.getByText(/Confirm the intentional venue-wide claim/i)).toBeInTheDocument();
    expect(mockDecideIceTimeRequest).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I intentionally want a venue-wide claim that blocks every surface/i,
      }),
    );
    await user.type(screen.getByLabelText(/^reason$/i), "Festival ice blocks the whole venue");
    await user.click(screen.getByRole("button", { name: /confirm full approval/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: VENUE_WIDE_REQUEST.id,
        status: "ACCEPTED",
        approvedSurfaceId: null,
        approvedSegmentId: null,
        intentionalVenueWideClaim: true,
        overrideReason: "Festival ice blocks the whole venue",
      }),
    );
  });

  it("requires a reason for conflict overrides and passes the override fields to the action", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[PENDING_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /partially approve/i }));
    await user.click(screen.getByRole("checkbox", { name: /override conflicts/i }));
    await user.click(screen.getByRole("button", { name: /confirm full approval/i }));

    expect(screen.getByText(/Enter a reason for this approval/i)).toBeInTheDocument();
    expect(mockDecideIceTimeRequest).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^reason$/i), "Scheduler confirmed the overlap is intentional");
    await user.click(screen.getByRole("button", { name: /confirm full approval/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideConflicts: true,
        overrideReason: "Scheduler confirmed the overlap is intentional",
      }),
    );
  });

  it("renders server validation failures returned by decideIceTimeRequest", async () => {
    mockDecideIceTimeRequest.mockResolvedValueOnce({
      success: false,
      error: "Venue-wide reservations require venue-manager authorization.",
    });
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[PENDING_REQUEST]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve in full/i }));

    expect(await screen.findByText(/Venue-wide reservations require venue-manager authorization/i)).toBeInTheDocument();
  });

  it("declines, cancels, expires, and annotates with the exact request identity", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[ACCEPTED_REQUEST_WITH_RESERVATION]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /decline/i }));
    await user.type(screen.getByLabelText(/decision message/i), "No longer available");
    await user.click(screen.getByRole("button", { name: /confirm decline/i }));

    expect(mockDecideIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: ACCEPTED_REQUEST_WITH_RESERVATION.id,
        status: "DECLINED",
        decisionMessage: "No longer available",
      }),
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockCancelIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: ACCEPTED_REQUEST_WITH_RESERVATION.id }),
    );

    await user.click(screen.getByRole("button", { name: /expire/i }));
    expect(mockExpireIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: ACCEPTED_REQUEST_WITH_RESERVATION.id }),
    );

    await user.type(screen.getByLabelText(/internal note/i), "Flood crew confirmed split-sheet setup.");
    await user.click(screen.getByRole("button", { name: /save note/i }));
    expect(mockAnnotateIceTimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: ACCEPTED_REQUEST_WITH_RESERVATION.id,
        decisionMessage: "Flood crew confirmed split-sheet setup.",
      }),
    );
  });

  it("displays requested and approved space distinctly for partial approvals", () => {
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[ACCEPTED_REQUEST_WITH_RESERVATION]}
      />,
    );

    const card = screen.getByText("Coach Two").closest(".MuiCard-root") as HTMLElement | null;
    expect(card).not.toBeNull();
    const scoped = within(card!);
    expect(scoped.getByText(/Requested space: Rink A/)).toBeInTheDocument();
    expect(scoped.getByText(/Approved: Rink B \/ Studio Sheet/)).toBeInTheDocument();
  });

  it("uses the venue timezone consistently across DST-sensitive rendering", () => {
    renderWithTheme(
      <IceTimeRequestQueue
        organizationId={ORGANIZATION_ID}
        venueId={VENUE_ID}
        venueName="North Rink"
        venueTimeZone="America/New_York"
        surfaceOptions={SURFACE_OPTIONS}
        requests={[
          {
            ...PENDING_REQUEST,
            id: "clreqsummerxxxxxxxxxxxxxxx",
            requestedStartAt: new Date("2026-07-10T22:00:00Z"),
            requestedEndAt: new Date("2026-07-10T23:00:00Z"),
          },
          {
            ...PENDING_REQUEST,
            id: "clreqwinterxxxxxxxxxxxxxxx",
            requestedStartAt: new Date("2026-01-10T23:00:00Z"),
            requestedEndAt: new Date("2026-01-11T00:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText(/EDT/)).toBeInTheDocument();
    expect(screen.getByText(/EST/)).toBeInTheDocument();
    expect(screen.getAllByText(/America\/New_York/)[0]).toBeInTheDocument();
  });
});
