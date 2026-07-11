import { describe, it, expect } from "vitest";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { validatePlayData } from "@/types/practice-planner";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";

const withinRink = ({ x, y }: { x: number; y: number }) =>
    x >= 0 && x <= RINK_DIMENSIONS.width && y >= 0 && y <= RINK_DIMENSIONS.height;

describe("Starter plays pack", () => {
    it("contains at least 8 plays", () => {
        expect(STARTER_PLAYS.length).toBeGreaterThanOrEqual(8);
    });

    it("has unique play ids and names", () => {
        const ids = STARTER_PLAYS.map((p) => p.id);
        const names = STARTER_PLAYS.map((p) => p.name.toLowerCase());
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(names).size).toBe(names.length);
    });

    describe.each(STARTER_PLAYS.map((play) => [play.name, play] as const))(
        "%s",
        (_name, play) => {
            it("has a name and a coaching description", () => {
                expect(play.name.trim().length).toBeGreaterThan(0);
                expect(play.name.length).toBeLessThanOrEqual(100);
                expect(play.description.trim().length).toBeGreaterThan(20);
                expect(play.description.length).toBeLessThanOrEqual(1000);
            });

            it("passes PlayData validation", () => {
                const result = validatePlayData(play.playData);
                expect(result.errors).toEqual([]);
                expect(result.valid).toBe(true);
            });

            it("has element ids unique within the play", () => {
                const ids = [
                    ...play.playData.players.map((p) => p.id),
                    ...play.playData.drawings.map((d) => d.id),
                    ...play.playData.annotations.map((a) => a.id),
                ];
                expect(new Set(ids).size).toBe(ids.length);
            });

            it("keeps every coordinate within the rink bounds", () => {
                for (const player of play.playData.players) {
                    expect(withinRink(player.position)).toBe(true);
                }
                for (const drawing of play.playData.drawings) {
                    for (const point of drawing.points) {
                        expect(withinRink(point)).toBe(true);
                    }
                }
                for (const annotation of play.playData.annotations) {
                    expect(withinRink(annotation.position)).toBe(true);
                }
            });

            it("places players on the ice with movement drawn", () => {
                expect(play.playData.players.length).toBeGreaterThanOrEqual(3);
                expect(play.playData.drawings.length).toBeGreaterThanOrEqual(3);
            });
        }
    );
});
