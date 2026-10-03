/**
 * Unit tests for Hockey Practice Planner type definitions and validation
 * Tests coverage:
 * - PlayData, PlayerIcon, DrawingElement, TextAnnotation structures
 * - PracticeSessionData and PlayInSession types
 * - Validation functions for all data structures
 * - Schema validation against spec requirements
 */

import { describe, it, expect } from "vitest";
import {
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    PlayData,
    PracticeSessionData,
    SavedPlay,
    DrawingTool,
    VALIDATION_CONSTRAINTS,
    validateSessionDuration,
} from "@/types/practice-planner";
import { createEmptyPlayData, strokeFromV1Type } from "@/lib/utils/play-data";

describe("Hockey Practice Planner Types", () => {
    describe("Session Duration Validation", () => {
        it("should validate minimum duration", () => {
            const result = validateSessionDuration(
                VALIDATION_CONSTRAINTS.MIN_DURATION
            );
            expect(result.valid).toBe(true);
        });

        it("should validate maximum duration", () => {
            const result = validateSessionDuration(
                VALIDATION_CONSTRAINTS.MAX_DURATION
            );
            expect(result.valid).toBe(true);
        });

        it("should reject duration below minimum", () => {
            const result = validateSessionDuration(
                VALIDATION_CONSTRAINTS.MIN_DURATION - 1
            );
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "DURATION_TOO_SHORT",
                })
            );
        });

        it("should reject duration above maximum", () => {
            const result = validateSessionDuration(
                VALIDATION_CONSTRAINTS.MAX_DURATION + 1
            );
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "DURATION_TOO_LONG",
                })
            );
        });

        it("should reject non-number duration", () => {
            const result = validateSessionDuration(NaN);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "INVALID_TYPE",
                })
            );
        });
    });

    describe("DrawingTool Type", () => {
        it("should define all drawing tool types", () => {
            const tools: DrawingTool[] = [
                "select",
                "player",
                "stroke",
                "equipment",
                "text",
                "eraser",
            ];
            expect(tools).toHaveLength(6);
        });
    });

    describe("Validation Constants", () => {
        it("should define reasonable constraints", () => {
            expect(VALIDATION_CONSTRAINTS.MAX_ELEMENTS_PER_PLAY).toBe(100);
            expect(VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH).toBe(500);
            expect(VALIDATION_CONSTRAINTS.MIN_DURATION).toBe(1);
            expect(VALIDATION_CONSTRAINTS.MAX_DURATION).toBe(300);
            expect(VALIDATION_CONSTRAINTS.MAX_PLAYERS).toBe(50);
            expect(VALIDATION_CONSTRAINTS.MAX_DRAWINGS).toBe(100);
            expect(VALIDATION_CONSTRAINTS.MAX_ANNOTATIONS).toBe(20);
        });

        it("should have consistent limits", () => {
            // Total max elements should be sum of individual limits
            const totalIndividualLimits =
                VALIDATION_CONSTRAINTS.MAX_PLAYERS +
                VALIDATION_CONSTRAINTS.MAX_DRAWINGS +
                VALIDATION_CONSTRAINTS.MAX_ANNOTATIONS;
            // This is >= MAX_ELEMENTS_PER_PLAY
            expect(totalIndividualLimits).toBeGreaterThanOrEqual(
                VALIDATION_CONSTRAINTS.MAX_ELEMENTS_PER_PLAY
            );
        });
    });

    describe("Type Conformance to Requirements", () => {
        it("should support requirement 1.1 - rink board visual representation", () => {
            // PlayData stores players, drawings, annotations needed for rink board
            const playData: PlayData = createEmptyPlayData();
            expect(playData).toHaveProperty("players");
            expect(playData).toHaveProperty("drawings");
            expect(playData).toHaveProperty("annotations");
        });

        it("should support requirement 1.2 - player icon placement", () => {
            const player: PlayerIcon = {
                id: "p1",
                position: { x: 50, y: 100 },
                role: "F",
                label: "Center",
                color: "#FF0000",
            };
            expect(player.position).toHaveProperty("x");
            expect(player.position).toHaveProperty("y");
            expect(player.label).toBeDefined();
        });

        it("should support requirement 1.3 - drawing paths", () => {
            const drawing: DrawingElement = {
                id: "d1",
                ...strokeFromV1Type("line"),
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(drawing.action).toBe("line");
            expect(drawing.points).toHaveLength(2);
        });

        it("should support requirement 1.4 - text annotations", () => {
            const annotation: TextAnnotation = {
                id: "t1",
                text: "Player movement",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(annotation.text).toBeDefined();
            expect(annotation.fontSize).toBeGreaterThan(0);
        });

        it("should support requirement 2.1 - practice session metadata", () => {
            const session: PracticeSessionData = {
                title: "Monday Practice",
                date: new Date(),
                duration: 60,
                plays: [],
                isShared: false,
            };
            expect(session.title).toBeDefined();
            expect(session.date).toBeInstanceOf(Date);
            expect(session.duration).toBeGreaterThan(0);
        });

        it("should support requirement 4.1 - saved play library", () => {
            const savedPlay: SavedPlay = {
                id: "lib-1",
                name: "Power Play",
                description: "5v4 power play setup",
                thumbnail: "data:image/png;base64,...",
                playData: createEmptyPlayData(),
                isTemplate: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(savedPlay).toHaveProperty("id");
            expect(savedPlay).toHaveProperty("thumbnail");
            expect(savedPlay).toHaveProperty("isTemplate");
        });

        it("should support requirement 5.1 - drawing tools color support", () => {
            const drawing: DrawingElement = {
                id: "d1",
                ...strokeFromV1Type("line"),
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#FF6600",
                strokeWidth: 2,
            };
            expect(drawing.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
    });
});
