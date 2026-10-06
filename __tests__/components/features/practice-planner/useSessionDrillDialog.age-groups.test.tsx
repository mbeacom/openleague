/** The session editor's drill dialog state carries a card's age groups both ways. */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSessionDrillDialog } from "@/components/features/practice-planner/useSessionDrillDialog";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { SessionItem } from "@/types/practice-planner";

const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const CARD: SessionItem = {
    id: "k1", playId: OWNED, name: "Keep-Away", description: "", sequence: 0, runsWithPrevious: false, duration: 10,
    instructions: "", playData: createEmptyPlayData(), ageGroups: ["u6", "u8"],
};

function useHarness() {
    const [plays, setPlays] = useState<SessionItem[]>([CARD]);
    const dialog = useSessionDrillDialog(plays, setPlays, () => undefined, async () => ({ ok: true }));
    return { plays, dialog };
}

describe("useSessionDrillDialog: age groups", () => {
    it("opens a card's diagram with its groups, and a save puts the new groups on the card", async () => {
        const { result } = renderHook(() => useHarness());
        act(() => result.current.dialog.editDiagram("k1"));
        expect(result.current.dialog.drill).toMatchObject({ ageGroups: ["u6", "u8"] });
        await act(async () => {
            await result.current.dialog.onSaved("k1", { playId: OWNED, name: "Keep-Away", description: "", thumbnail: "", playData: createEmptyPlayData(), ageGroups: ["u10"] });
        });
        expect(result.current.plays[0]).toMatchObject({ ageGroups: ["u10"] });
    });
});
