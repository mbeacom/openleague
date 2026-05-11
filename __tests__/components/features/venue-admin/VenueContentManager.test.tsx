import { ThemeProvider } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LessonOfferingEditor } from "@/components/features/venue-admin/LessonOfferingEditor";
import { PublicRinkContent } from "@/components/features/venue-admin/PublicRinkContent";
import { SpecialtyEventEditor } from "@/components/features/venue-admin/SpecialtyEventEditor";
import { VenueContentManager } from "@/components/features/venue-admin/VenueContentManager";
import theme from "@/lib/theme";

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("venue content manager components", () => {
  it("renders content editors", () => {
    renderWithTheme(
      <>
        <LessonOfferingEditor organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx" venueId="clvenxxxxxxxxxxxxxxxxxxxxxxx" />
        <SpecialtyEventEditor organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx" venueId="clvenxxxxxxxxxxxxxxxxxxxxxxx" />
        <VenueContentManager posts={[{ id: "post-1", title: "Rink News", status: "PUBLISHED" }]} />
      </>
    );

    expect(screen.getByText("Lesson offering")).toBeInTheDocument();
    expect(screen.getByText("Specialty event")).toBeInTheDocument();
    expect(screen.getByText("Rink News")).toBeInTheDocument();
  });

  it("renders public rink content sections", () => {
    renderWithTheme(
      <PublicRinkContent
        posts={[{ id: "post-1", title: "Rink News", excerpt: "News", slug: "rink-news" }]}
        lessons={[{ id: "lesson-1", title: "Learn to Skate", lessonType: "GROUP" }]}
        events={[{ id: "event-1", title: "Holiday Skate", startsAt: new Date("2026-12-01T18:00:00Z") }]}
      />
    );

    expect(screen.getByText("Lessons")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
  });
});
