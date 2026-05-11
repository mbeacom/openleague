import { ThemeProvider } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IceSurfaceManager } from "@/components/features/venue-admin/IceSurfaceManager";
import { OperatingHoursEditor } from "@/components/features/venue-admin/OperatingHoursEditor";
import { ScheduleBlockEditor } from "@/components/features/venue-admin/ScheduleBlockEditor";
import { VenueScheduleCalendar } from "@/components/features/venue-admin/VenueScheduleCalendar";
import theme from "@/lib/theme";

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("venue schedule management components", () => {
  it("renders surface manager controls", () => {
    renderWithTheme(
      <IceSurfaceManager
        organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx"
        venueId="clvenxxxxxxxxxxxxxxxxxxxxxxx"
        surfaces={[{ id: "surface-1", name: "Main Rink", surfaceType: "ICE", isActive: true }]}
      />
    );

    expect(screen.getByText("Ice surfaces")).toBeInTheDocument();
    expect(screen.getByText("Main Rink")).toBeInTheDocument();
  });

  it("renders operating hours editor", () => {
    renderWithTheme(
      <OperatingHoursEditor
        organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx"
        venueId="clvenxxxxxxxxxxxxxxxxxxxxxxx"
        operatingHours={[{ id: "hour-1", dayOfWeek: 1, opensAt: "08:00", closesAt: "22:00", status: "OPEN" }]}
      />
    );

    expect(screen.getByText("Operating hours")).toBeInTheDocument();
    expect(screen.getByText("Monday: 08:00-22:00")).toBeInTheDocument();
  });

  it("renders schedule block editor and calendar", () => {
    renderWithTheme(
      <>
        <ScheduleBlockEditor organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx" venueId="clvenxxxxxxxxxxxxxxxxxxxxxxx" />
        <VenueScheduleCalendar
          blocks={[
            {
              id: "block-1",
              title: "Open Skate",
              startsAt: new Date("2026-02-01T18:00:00Z"),
              endsAt: new Date("2026-02-01T20:00:00Z"),
              activityType: "OPEN_SKATE",
              status: "PUBLISHED",
            },
          ]}
        />
      </>
    );

    expect(screen.getByText("Schedule block")).toBeInTheDocument();
    expect(screen.getByText("Venue schedule")).toBeInTheDocument();
    expect(screen.getByText("Open Skate")).toBeInTheDocument();
  });
});
