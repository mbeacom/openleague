/** useClockText (3b): viewer-zone times render only after mount; venue-zone times render at once. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { TIME_PLACEHOLDER, useClockText } from "@/lib/hooks/useClockText";
import { formatClockTime } from "@/lib/utils/date";

const SIX_PM_EDT = new Date("2026-04-07T22:00:00.000Z");

function Probe({ timeZone, showZone }: { timeZone?: string; showZone: boolean }) {
    const clock = useClockText(timeZone, showZone);
    return <p>{`${clock.longDate(SIX_PM_EDT)} | ${clock.time(SIX_PM_EDT)}`}</p>;
}

describe("useClockText", () => {
    it("renders a placeholder on the server when the time depends on the viewer's zone", () => {
        const html = renderToStaticMarkup(<Probe showZone={false} />);
        expect(html).toContain(`${TIME_PLACEHOLDER} | ${TIME_PLACEHOLDER}`);
        expect(html).not.toMatch(/\d:\d\d [AP]M/);
    });

    it("renders a venue-zone time on the server, since server and browser agree", () => {
        expect(renderToStaticMarkup(<Probe timeZone="America/New_York" showZone />)).toContain(
            "Tuesday, April 7, 2026 | 6:00 PM EDT",
        );
    });

    it("renders the viewer-zone time once mounted", () => {
        render(<Probe showZone={false} />);
        expect(screen.getByText(new RegExp(`\\| ${formatClockTime(SIX_PM_EDT)}$`))).toBeInTheDocument();
    });
});
