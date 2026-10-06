/** Line editing handle and ring colours (line editing spec R6). */
import { describe, expect, it } from "vitest";
import { getContrastRatio } from "@mui/material/styles";
import theme from "@/lib/theme";
import { LINE_EDIT_COLORS } from "@/lib/utils/canvas/notation";
import { ICE_COLOR } from "@/lib/utils/canvas/rink-renderer";

describe("line editing colours", () => {
    it("are the theme's light-scheme blues (the ice is drawn light in both schemes)", () => {
        const light = theme.colorSchemes.light!.palette;
        expect(LINE_EDIT_COLORS.handleStroke).toBe(light.secondary.main);
        expect(LINE_EDIT_COLORS.snapRing).toBe(light.primary.main);
    });

    it("reach 3:1 against the ice", () => {
        expect(getContrastRatio(LINE_EDIT_COLORS.handleStroke, ICE_COLOR)).toBeGreaterThanOrEqual(3);
        expect(getContrastRatio(LINE_EDIT_COLORS.snapRing, ICE_COLOR)).toBeGreaterThanOrEqual(3);
    });
});
