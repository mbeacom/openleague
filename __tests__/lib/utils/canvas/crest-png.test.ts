/** crestPng: the Crest as a PNG for print and exports, with the on-screen Crest's initials, color and ink (practice logo spec R3). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREST_EXPORT_PX, CREST_FONT_RATIO, crestInk, crestPng, paintCrest } from "@/lib/utils/canvas/crest-png";

let fillStyles: string[] = [];

/** vitest.setup.ts's 2d context mock, recording every fillStyle and adding any method it lacks as a vi.fn. */
function recordingContext() {
    fillStyles = [];
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
        set(t, key, value) {
            if (key === "fillStyle") fillStyles.push(String(value));
            t[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("paintCrest", () => {
    it("fills a circle in the team color and centers the initials in white on a dark color", () => {
        const ctx = recordingContext();
        paintCrest(ctx, { name: "18U Ice Hawks", color: "#0D47A1", size: 192 });
        expect(ctx.arc).toHaveBeenCalledWith(96, 96, 96, 0, Math.PI * 2);
        expect(fillStyles).toEqual(["#0D47A1", "#fff"]);
        expect(ctx.fillText).toHaveBeenCalledWith("IH", 96, 96);
        expect(ctx.font).toMatch(new RegExp(`^800 ${Math.round(192 * CREST_FONT_RATIO)}px 'Cabinet Grotesk'`));
        expect([ctx.textAlign, ctx.textBaseline]).toEqual(["center", "middle"]);
    });

    it("uses dark ink on a light brand color, as the on-screen Crest does", () => {
        expect(crestInk("#FFEB3B")).toBe("#000");
        expect(crestInk("#9B1B30")).toBe("#fff");
    });
});

describe("crestPng", () => {
    it("draws on a size × size canvas and returns its PNG", () => {
        const ctx = recordingContext();
        let drawnOn: HTMLCanvasElement | undefined;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
            drawnOn = this;
            return ctx;
        } as never);
        expect(crestPng({ name: "Storm", color: "#00695C", size: CREST_EXPORT_PX })).toBe("data:image/png;base64,mockImageData"); // vitest.setup.ts's toDataURL
        expect([drawnOn?.width, drawnOn?.height]).toEqual([192, 192]);
        expect(ctx.fillText).toHaveBeenCalledWith("ST", 96, 96);
    });

    it("returns null without a 2d context", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        expect(crestPng({ name: "Storm", color: "#00695C", size: 48 })).toBeNull();
    });
});
