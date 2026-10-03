import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionGroup } from "@/components/features/practice-planner/OptionGroup";

const OPTIONS = ["a", "b"] as const;
const LABELS = { a: "Alpha", b: "Bravo" } as const;

describe("OptionGroup", () => {
    it("shows a tooltip with each option's label", async () => {
        render(<OptionGroup label="letters" value="a" options={OPTIONS} labels={LABELS} onChange={() => {}} />);
        await userEvent.hover(screen.getByRole("button", { name: "Bravo" }));
        expect(await screen.findByRole("tooltip")).toHaveTextContent("Bravo");
    });

    it("keeps exclusive selection working through the tooltip wrapper", async () => {
        const onChange = vi.fn();
        render(<OptionGroup label="letters" value="a" options={OPTIONS} labels={LABELS} onChange={onChange} />);
        expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Bravo" })).toHaveAttribute("aria-pressed", "false");
        await userEvent.click(screen.getByRole("button", { name: "Bravo" }));
        expect(onChange).toHaveBeenCalledWith("b");
        await userEvent.click(screen.getByRole("button", { name: "Alpha" })); // re-click current: no deselect
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});
