/** The drill editor's Age groups field (age-group templates R4). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import type { AgeGroup } from "@/lib/utils/age-groups";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
const field = () => screen.getByRole("group", { name: "Age groups" });
const chip = (name: string) => within(field()).getByRole("button", { name });

describe("PlayEditor: Age groups", () => {
    it("offers one 44 px toggle per group, with the helper text", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill" }} autoSave={false} />);
        const chips = within(field()).getAllByRole("button");
        expect(chips.map((c) => c.textContent)).toEqual(["6U", "8U", "10U", "12U", "14U", "16U+"]);
        for (const c of chips) {
            expect(c).toHaveAttribute("aria-pressed", "false");
            expect(c).toHaveStyle({ minHeight: "44px", minWidth: "44px" });
        }
        expect(screen.getByText("Leave empty if it suits every age.")).toBeInTheDocument();
    });

    it("starts from the drill's groups, ignoring any it doesn't know", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill", ageGroups: ["u12", "u7" as AgeGroup] }} autoSave={false} />);
        expect(chip("12U")).toHaveAttribute("aria-pressed", "true");
        expect(within(field()).getAllByRole("button").filter((c) => c.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    });

    it("toggles groups, marks the drill unsaved, and saves them in table order", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onDirtyChange = vi.fn();
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill", ageGroups: ["u12"] }} autoSave={false} onSave={onSave} onDirtyChange={onDirtyChange} />);
        fireEvent.click(chip("8U"));
        fireEvent.click(chip("12U"));
        fireEvent.click(chip("6U"));
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ageGroups: ["u6", "u8"] })));
    });

    it("saves [] (every age) for a drill with none chosen", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill" }} autoSave={false} onSave={onSave} />);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ageGroups: [] })));
    });
});
