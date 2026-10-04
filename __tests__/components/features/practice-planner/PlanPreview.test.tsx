import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";

const NOW = new Date("2026-10-04T18:00:00.000Z");

describe("PlanPreview: rotation and the gap", () => {
    it("names the rotation, marks the stays station, lists the cool-down and says the gap", () => {
        const skills = STARTER_TEMPLATES.find((template) => template.id === "template-skills-stations");
        if (!skills) throw new Error("Skills Stations is missing");
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <PlanPreview plan={starterTemplatePlan(skills, "openleague-static", NOW)} />
            </ThemeProvider>,
        );
        expect(screen.getByText("Stations · rotate every 6 min · 12 min")).toBeInTheDocument();
        expect(screen.getByText("stays")).toBeInTheDocument();
        expect(screen.getByText("Rotates every 6 min")).toBeInTheDocument();
        expect(screen.getByText("Cool-down")).toBeInTheDocument();
        expect(screen.getByText(/2 min between blocks/)).toBeInTheDocument();
        expect(screen.getByText(/Planned 60 of 60 min/)).toBeInTheDocument();
    });
});
