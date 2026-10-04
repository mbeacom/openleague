/** The practice-planner list offers "Import plan" to anyone who can schedule for at least one team (ADR-0020). */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";

function renderList(props: { isAdmin: boolean; canImport: boolean }) {
    render(<PracticePlannerList sessions={[]} teamId="cteamxxxxxxxxxxxxxxxxxxxx" teamName="Lions" {...props} />);
}

describe("PracticePlannerList Import plan", () => {
    it("links to the import page when the user can import", () => {
        renderList({ isAdmin: true, canImport: true });
        expect(screen.getByRole("link", { name: /import plan/i })).toHaveAttribute("href", "/practice-planner/import");
    });

    it("shows it to a member of this team who administers another team", () => {
        renderList({ isAdmin: false, canImport: true });
        expect(screen.getByRole("link", { name: /import plan/i })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /new session/i })).not.toBeInTheDocument();
    });

    it("hides it when the user can't schedule anywhere", () => {
        renderList({ isAdmin: false, canImport: false });
        expect(screen.queryByRole("link", { name: /import plan/i })).not.toBeInTheDocument();
    });

    it("lets the header actions wrap so three buttons don't overflow a phone", () => {
        renderList({ isAdmin: true, canImport: true });
        const row = screen.getByRole("link", { name: /import plan/i }).parentElement as HTMLElement;
        expect(row).toContainElement(screen.getByRole("link", { name: /new session/i }));
        expect(row).toHaveStyle({ flexWrap: "wrap" });
    });
});

describe("PracticePlannerList Use a template", () => {
    it("links to the import page, where templates are offered, whenever Import is offered", () => {
        renderList({ isAdmin: false, canImport: true });
        expect(screen.getByRole("link", { name: /use a template/i })).toHaveAttribute("href", "/practice-planner/import");
    });

    it("hides it when the user can't schedule anywhere", () => {
        renderList({ isAdmin: false, canImport: false });
        expect(screen.queryByRole("link", { name: /use a template/i })).not.toBeInTheDocument();
    });
});
