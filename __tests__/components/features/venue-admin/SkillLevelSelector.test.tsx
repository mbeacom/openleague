import { ThemeProvider } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicRinkFilters } from "@/components/features/venue-admin/PublicRinkFilters";
import { SkillLevelSelector } from "@/components/features/venue-admin/SkillLevelSelector";
import theme from "@/lib/theme";

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("skill level selector components", () => {
  it("renders skill level checkbox options", () => {
    renderWithTheme(
      <SkillLevelSelector
        skillLevels={[{ id: "level-1", label: "Squirt", discipline: "HOCKEY", source: "USA_HOCKEY" }]}
        selectedIds={[]}
      />
    );

    expect(screen.getByText("Skill levels")).toBeInTheDocument();
    expect(screen.getByLabelText("Squirt")).toBeInTheDocument();
  });

  it("renders public rink filter links", () => {
    renderWithTheme(<PublicRinkFilters skillLevels={[{ id: "level-1", label: "Squirt" }]} basePath="/rinks/north-rink/schedule" />);

    expect(screen.getByText("Filter by level")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Squirt" })).toHaveAttribute("href", "/rinks/north-rink/schedule?level=level-1");
  });
});
