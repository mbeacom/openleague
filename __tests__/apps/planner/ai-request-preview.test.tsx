import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestPreview } from "@/apps/planner/src/ai/RequestPreview";
import { REQUEST_WARNING_THRESHOLD } from "@/apps/planner/src/ai/key-holder";
import { buildNotesRequest } from "@/lib/ai/tasks/notes-to-plan";

const built = buildNotesRequest({ notes: "Warm-up 5 min, then 3-Man Weave 10 min.", model: "m", staffNames: [], otherNames: [] });

function preview(requestNumber: number) {
    return render(<RequestPreview request={built.request} redaction={built.redaction} destination="Anthropic" model="m" requestNumber={requestNumber} />);
}

describe("RequestPreview: the request-count warning (spec R5: after 20 requests)", () => {
    it("warns after 20 requests in this tab", () => {
        expect(REQUEST_WARNING_THRESHOLD).toBe(20);
    });

    it("doesn't warn for the 20th request", () => {
        preview(20);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("warns from the 21st request on", () => {
        const { unmount } = preview(21);
        expect(screen.getByRole("alert").textContent).toMatch(/request 21 from this tab/);
        unmount();
        preview(22);
        expect(screen.getByRole("alert").textContent).toMatch(/request 22 from this tab/);
    });
});
