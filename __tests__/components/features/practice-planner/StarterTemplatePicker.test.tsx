import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { StarterTemplatePicker, starterTemplateImport } from "@/components/features/practice-planner/StarterTemplatePicker";
import { STARTER_TEMPLATES } from "@/lib/data/starter-templates";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { drillRows } from "@/lib/utils/session-rows";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";

describe("StarterTemplatePicker", () => {
    it("lists every template under one heading, with its length and a Use template button", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        expect(screen.getByRole("heading", { name: "Start from a template" })).toBeInTheDocument();
        for (const template of STARTER_TEMPLATES) {
            expect(screen.getByRole("heading", { name: template.name })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: `Use template: ${template.name}` })).toHaveTextContent("Use template");
        }
        expect(screen.getAllByText(`${STARTER_TEMPLATES[0].session.durationMinutes} min`).length).toBeGreaterThan(0);
    });

    it("hands the chosen template back", () => {
        const onUse = vi.fn();
        render(<StarterTemplatePicker onUse={onUse} />);
        fireEvent.click(screen.getByRole("button", { name: `Use template: ${STARTER_TEMPLATES[1].name}` }));
        expect(onUse).toHaveBeenCalledWith(STARTER_TEMPLATES[1]);
    });

    it("disables every Use template button while disabled", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} disabled />);
        for (const template of STARTER_TEMPLATES) {
            expect(screen.getByRole("button", { name: `Use template: ${template.name}` })).toBeDisabled();
        }
    });
});

describe("starterTemplateImport", () => {
    it("parses the template like a plan file, stamped with the running app and the click time", () => {
        const now = new Date("2026-10-03T18:00:00.000Z");
        const result = starterTemplateImport(STARTER_TEMPLATES[0], "openleague-static", now);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan).toMatchObject({ generator: "openleague-static", exportedAt: now.toISOString(), session: { title: STARTER_TEMPLATES[0].name } });
        expect(result.plan.session.drills).toHaveLength(STARTER_TEMPLATES[0].session.drills.length);
    });

    it("never shares a diagram with the starter drills, so editing the plan leaves them unchanged", () => {
        const before = structuredClone(STARTER_PLAYS);
        for (const template of STARTER_TEMPLATES) {
            const result = starterTemplateImport(template, "openleague-hosted");
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            for (const drill of drillRows(result.plan.session.drills)) {
                for (const play of STARTER_PLAYS) expect(drill.drill.playData).not.toBe(play.playData);
                drill.drill.playData.players.length = 0;
                drill.drill.playData.drawings.push(...drill.drill.playData.drawings);
            }
        }
        expect(STARTER_PLAYS).toEqual(before);
    });
});

describe("StarterTemplatePicker: counts", () => {
    it("counts each template's drills, never its cool-down row", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        const chips = STARTER_TEMPLATES.map((template) => {
            const card = screen.getByRole("heading", { name: template.name }).closest(".MuiCard-root");
            if (!(card instanceof HTMLElement)) throw new Error(`No card for ${template.name}`);
            return within(card).getByText(/^\d+ drills$/).textContent;
        });
        // Skills Stations 2 + 3 + 1 + 1 + 1 drills, Goalie & Skater 3 + 3 + 1 + 1, Team Practice 1 + 3 + 3 + 1 + 1,
        // then the 8U, 10U and 12U templates 4 + 1 each, and 3 + 1 + 1, and 8U Tag, Stops and Battles 2 + 2 + 1,
        // and 8U Partner Puck Control and Forecheck 2 + 2 + 1;
        // block rows (warm-up, break, cool-down) never count.
        expect(chips).toEqual(["8 drills", "8 drills", "9 drills", "5 drills", "5 drills", "5 drills", "5 drills", "5 drills"]);
    });
});

describe("StarterTemplatePicker: age filter (R3)", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    const cardNames = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

    it("shows each template's ages, and filters by the remembered age", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        const card = screen.getByRole("heading", { name: "8U Station Practice" }).closest(".MuiCard-root") as HTMLElement;
        expect(within(card).getByText("6U, 8U")).toBeInTheDocument();

        fireEvent.click(within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name: "6U" }));
        expect(cardNames()).toEqual(["8U Station Practice"]);
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u6");
        fireEvent.click(within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name: "14U" }));
        expect(cardNames()).toEqual(["Skills Stations", "Goalie & Skater Rotation", "Team Practice with Stations", "12U Skills and Small Games"]);
    });

    it("says when no template matches, and Show all ages brings them back", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u6");
        const only12U = STARTER_TEMPLATES.filter((template) => template.id === "template-12u-skills-games");
        render(<StarterTemplatePicker onUse={vi.fn()} templates={only12U} />);
        expect(screen.getByText("No templates for 6U yet.")).toBeInTheDocument();
        expect(cardNames()).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Show all ages" }));
        expect(cardNames()).toEqual(["12U Skills and Small Games"]);
    });
});
