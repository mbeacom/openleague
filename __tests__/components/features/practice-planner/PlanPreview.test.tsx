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
        expect(screen.getByText("stays · A coach shoots from the five spots.")).toBeInTheDocument();
        expect(screen.getByText("Rotates every 6 min")).toBeInTheDocument();
        expect(screen.getByText("Cool-down")).toBeInTheDocument();
        expect(screen.getByText(/2 min between blocks/)).toBeInTheDocument();
        expect(screen.getByText(/Planned 60 of 60 min/)).toBeInTheDocument();
    });

    it("gives a block that doesn't rotate its minutes, not a rotation", () => {
        const skills = STARTER_TEMPLATES.find((template) => template.id === "template-skills-stations");
        if (!skills) throw new Error("Skills Stations is missing");
        render(
            <ThemeProvider theme={createTheme()}>
                <PlanPreview plan={starterTemplatePlan(skills, "openleague-static", NOW)} />
            </ThemeProvider>,
        );
        expect(screen.getByText("Stations · 2 · 8 min")).toBeInTheDocument();
        expect(screen.getByText("8 min · A coach warms up the goalies while the skaters work edges.")).toBeInTheDocument();
        expect(screen.getByText("Goalie Warm-Up").closest("li")?.textContent).not.toMatch(/Rotates every|stays/);
    });

    it("leaves the gap out of the subtitle when there is none", () => {
        const rotation = STARTER_TEMPLATES.find((template) => template.id === "template-goalie-skater-rotation");
        if (!rotation) throw new Error("Goalie & Skater Rotation is missing");
        render(
            <ThemeProvider theme={createTheme()}>
                <PlanPreview plan={starterTemplatePlan(rotation, "openleague-static", NOW)} />
            </ThemeProvider>,
        );
        expect(screen.getByText("45 min · Planned 45 of 45 min")).toBeInTheDocument();
        expect(screen.queryByText(/between blocks/)).toBeNull();
    });
});
