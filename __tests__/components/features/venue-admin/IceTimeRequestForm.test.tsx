import { ThemeProvider } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AvailableIceBrowser } from "@/components/features/venue-admin/AvailableIceBrowser";
import { IceTimeRequestForm } from "@/components/features/venue-admin/IceTimeRequestForm";
import { IceTimeRequestQueue } from "@/components/features/venue-admin/IceTimeRequestQueue";
import theme from "@/lib/theme";

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("ice time request components", () => {
  beforeEach(() => {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
  });

  it("renders available ice browser and request form", () => {
    renderWithTheme(
      <>
        <AvailableIceBrowser
          blocks={[{ id: "block-1", title: "Available Ice", startsAt: new Date("2026-03-01T10:00:00Z"), endsAt: new Date("2026-03-01T11:00:00Z") }]}
        />
        <IceTimeRequestForm scheduleBlockId="block-1" venueId="venue-1" />
      </>
    );

    expect(screen.getByText("Available ice")).toBeInTheDocument();
    expect(screen.getByText("Available Ice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit request" })).toBeInTheDocument();
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
