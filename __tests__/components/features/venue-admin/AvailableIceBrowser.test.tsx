import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvailableIceBrowser } from "@/components/features/venue-admin/AvailableIceBrowser";

describe("AvailableIceBrowser", () => {
  it("renders staff occupancy and remaining slices without a public request action", () => {
    render(
      <AvailableIceBrowser
        timeZone="America/New_York"
        mode="staff"
        blocks={[
          {
            id: "offering-1",
            title: "Sunday ice",
            startsAt: "2026-03-08T06:30:00.000Z",
            endsAt: "2026-03-08T08:30:00.000Z",
            occupancy: [
              {
                startsAt: "2026-03-08T06:45:00.000Z",
                endsAt: "2026-03-08T07:15:00.000Z",
              },
            ],
            remainingSlices: [
              {
                startsAt: "2026-03-08T06:30:00.000Z",
                endsAt: "2026-03-08T06:45:00.000Z",
              },
              {
                startsAt: "2026-03-08T07:15:00.000Z",
                endsAt: "2026-03-08T08:30:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "Sun, Mar 8, 1:30 AM EST – Sun, Mar 8, 4:30 AM EDT",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Occupancy:.*1:45 AM EST.*3:15 AM EDT/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Remaining:.*1:30 AM EST.*1:45 AM EST.*3:15 AM EDT.*4:30 AM EDT/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request this ice" })).not.toBeInTheDocument();
  });

  it("renders public remaining slices and request action without occupancy detail", () => {
    render(
      <AvailableIceBrowser
        timeZone="America/New_York"
        mode="public"
        blocks={[
          {
            id: "offering-1",
            title: "Sunday ice",
            startsAt: "2026-03-08T06:30:00.000Z",
            endsAt: "2026-03-08T08:30:00.000Z",
            remainingSlices: [
              {
                startsAt: "2026-03-08T06:30:00.000Z",
                endsAt: "2026-03-08T08:30:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByText(/Occupancy:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request this ice" })).toHaveStyle({
      minHeight: "44px",
    });
  });
});
