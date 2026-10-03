/** The practice-planner list offers "Import plan" to anyone who can schedule for at least one team (ADR-0020). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));

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
