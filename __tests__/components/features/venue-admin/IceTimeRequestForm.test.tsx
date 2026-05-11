import { ThemeProvider } from "@mui/material/styles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AvailableIceBrowser } from "@/components/features/venue-admin/AvailableIceBrowser";
import { IceTimeRequestForm } from "@/components/features/venue-admin/IceTimeRequestForm";
import { IceTimeRequestQueue } from "@/components/features/venue-admin/IceTimeRequestQueue";
import theme from "@/lib/theme";

const { mockSubmitIceTimeRequest } = vi.hoisted(() => ({
  mockSubmitIceTimeRequest: vi.fn(),
}));

vi.mock("@/lib/actions/venue-requests", () => ({
  submitIceTimeRequest: (...args: unknown[]) => mockSubmitIceTimeRequest(...args),
}));

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("ice time request components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
    mockSubmitIceTimeRequest.mockResolvedValue({
      success: true,
      data: { requestId: "clreqxxxxxxxxxxxxxxxxxxxxxxx", status: "SUBMITTED" },
    });
  });

  it("renders available ice browser and request form", () => {
    renderWithTheme(
      <>
        <AvailableIceBrowser
          blocks={[{ id: "block-1", title: "Available Ice", startsAt: new Date("2026-03-01T10:00:00Z"), endsAt: new Date("2026-03-01T11:00:00Z") }]}
        />
        <IceTimeRequestForm
          scheduleBlockId="block-1"
          venueId="venue-1"
          venueName="North Rink"
          startsAt="2026-03-01T10:00:00Z"
          endsAt="2026-03-01T11:00:00Z"
        />
      </>
    );

    expect(screen.getByText("Available ice")).toBeInTheDocument();
    expect(screen.getByText("Available Ice")).toBeInTheDocument();
    expect(screen.getByText("Requesting ice at North Rink")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit request" })).toBeInTheDocument();
  });

  it("submits ice time request details through the Server Action", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <IceTimeRequestForm
        scheduleBlockId="block-1"
        venueId="venue-1"
        venueName="North Rink"
        startsAt="2026-03-01T10:00:00Z"
        endsAt="2026-03-01T11:00:00Z"
      />
    );

    await user.type(screen.getByLabelText("Requester organization"), "Sharks Hockey");
    await user.type(screen.getByLabelText(/Contact name/), "Coach One");
    await user.type(screen.getByLabelText(/Contact email/), "coach@example.com");
    await user.type(screen.getByLabelText(/Notes/), "Need a goalie net.");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(mockSubmitIceTimeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleBlockId: "block-1",
          venueId: "venue-1",
          requesterOrganizationName: "Sharks Hockey",
          contactName: "Coach One",
          contactEmail: "coach@example.com",
          notes: "Need a goalie net.",
          requestedStartAt: expect.any(Date),
          requestedEndAt: expect.any(Date),
        })
      );
    });
    expect(await screen.findByText("Ice time request submitted.")).toBeInTheDocument();
  });

  it("renders private manager request queue details", () => {
    renderWithTheme(
      <IceTimeRequestQueue
        requests={[
          {
            id: "request-1",
            contactName: "Coach One",
            contactEmail: "coach@example.com",
            status: "SUBMITTED",
            requestedStartAt: new Date("2026-03-01T10:00:00Z"),
            requestedEndAt: new Date("2026-03-01T11:00:00Z"),
          },
        ]}
      />
    );

    expect(screen.getByText("Request queue")).toBeInTheDocument();
    expect(screen.getByText("coach@example.com")).toBeInTheDocument();
  });
});
