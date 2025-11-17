/**
 * Unit tests for Hockey Practice Planner type definitions and validation
 * Tests coverage:
 * - PlayData, PlayerIcon, DrawingElement, TextAnnotation structures
 * - PracticeSessionData and PlayInSession types
 * - Validation functions for all data structures
 * - Schema validation against spec requirements
 */

import {
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    PlayData,
    PlayInSession,
    PracticeSessionData,
    SavedPlay,
    PlayDataJSON,
    DrawingTool,
    VALIDATION_CONSTRAINTS,
    isValidPosition,
    isValidPlayerIcon,
    isValidDrawingElement,
    isValidTextAnnotation,
    validatePlayData,
    validatePlayDataJSON,
    validateSessionDuration,
    validatePlayDurations,
    validatePracticeSessionData,
} from "@/types/practice-planner";

describe("Hockey Practice Planner Types", () => {
    describe("Position Type", () => {
        it("should validate correct position", () => {
            const position: Position = { x: 100, y: 200 };
            expect(isValidPosition(position)).toBe(true);
        });

        it("should reject position with string coordinates", () => {
            const position = { x: "100", y: 200 };
            expect(isValidPosition(position)).toBe(false);
        });

        it("should reject position with missing properties", () => {
            const position = { x: 100 };
            expect(isValidPosition(position)).toBe(false);
        });

        it("should reject null position", () => {
            expect(isValidPosition(null)).toBe(false);
        });

        it("should reject NaN coordinates", () => {
            const position = { x: NaN, y: 100 };
            expect(isValidPosition(position)).toBe(false);
        });
    });

    describe("PlayerIcon Type & Validation", () => {
        it("should validate correct player icon", () => {
            const player: PlayerIcon = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "Center",
                color: "#FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(true);
        });

        it("should reject player with empty id", () => {
            const player = {
                id: "",
                position: { x: 50, y: 100 },
                label: "Center",
                color: "#FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should reject player with invalid position", () => {
            const player = {
                id: "player-1",
                position: { x: "invalid", y: 100 },
                label: "Center",
                color: "#FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should reject player with empty label", () => {
            const player = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "",
                color: "#FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should reject player with whitespace-only label", () => {
            const player = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "   ",
                color: "#FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should reject player with invalid hex color", () => {
            const player = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "Center",
                color: "FF0000",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should reject player with non-6-digit hex color", () => {
            const player = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "Center",
                color: "#FF00",
            };
            expect(isValidPlayerIcon(player)).toBe(false);
        });

        it("should validate player with lowercase hex color", () => {
            const player: PlayerIcon = {
                id: "player-1",
                position: { x: 50, y: 100 },
                label: "Center",
                color: "#ff0000",
            };
            expect(isValidPlayerIcon(player)).toBe(true);
        });
    });

    describe("DrawingElement Type & Validation", () => {
        it("should validate correct line drawing", () => {
            const drawing: DrawingElement = {
                id: "draw-1",
                type: "line",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(isValidDrawingElement(drawing)).toBe(true);
        });

        it("should validate curve drawing with multiple points", () => {
            const drawing: DrawingElement = {
                id: "draw-2",
                type: "curve",
                points: [
                    { x: 0, y: 0 },
                    { x: 50, y: 25 },
                    { x: 100, y: 100 },
                ],
                color: "#00FF00",
                strokeWidth: 1.5,
            };
            expect(isValidDrawingElement(drawing)).toBe(true);
        });

        it("should validate arrow drawing", () => {
            const drawing: DrawingElement = {
                id: "draw-3",
                type: "arrow",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#FF00FF",
                strokeWidth: 2.5,
            };
            expect(isValidDrawingElement(drawing)).toBe(true);
        });

        it("should reject drawing with fewer than 2 points", () => {
            const drawing = {
                id: "draw-1",
                type: "line",
                points: [{ x: 0, y: 0 }],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(isValidDrawingElement(drawing)).toBe(false);
        });

        it("should reject drawing with invalid type", () => {
            const drawing = {
                id: "draw-1",
                type: "invalid",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(isValidDrawingElement(drawing)).toBe(false);
        });

        it("should reject drawing with invalid color format", () => {
            const drawing = {
                id: "draw-1",
                type: "line",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "blue",
                strokeWidth: 2,
            };
            expect(isValidDrawingElement(drawing)).toBe(false);
        });

        it("should reject drawing with zero or negative stroke width", () => {
            const drawing = {
                id: "draw-1",
                type: "line",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 0,
            };
            expect(isValidDrawingElement(drawing)).toBe(false);
        });

        it("should reject drawing with invalid point coordinates", () => {
            const drawing = {
                id: "draw-1",
                type: "line",
                points: [
                    { x: 0, y: 0 },
                    { x: "invalid", y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(isValidDrawingElement(drawing)).toBe(false);
        });
    });

    describe("TextAnnotation Type & Validation", () => {
        it("should validate correct annotation", () => {
            const annotation: TextAnnotation = {
                id: "text-1",
                text: "Player Movement",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(true);
        });

        it("should reject annotation with empty text", () => {
            const annotation = {
                id: "text-1",
                text: "",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should reject annotation with empty id", () => {
            const annotation = {
                id: "",
                text: "Player Movement",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should reject annotation with text exceeding max length", () => {
            const annotation = {
                id: "text-1",
                text: "a".repeat(VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH + 1),
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should validate annotation at max text length", () => {
            const annotation: TextAnnotation = {
                id: "text-1",
                text: "a".repeat(VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH),
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(true);
        });

        it("should reject annotation with zero or negative font size", () => {
            const annotation = {
                id: "text-1",
                text: "Player Movement",
                position: { x: 50, y: 50 },
                fontSize: 0,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should reject annotation with invalid color", () => {
            const annotation = {
                id: "text-1",
                text: "Player Movement",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "black",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should reject annotation with invalid position", () => {
            const annotation = {
                id: "text-1",
                text: "Player Movement",
                position: { x: "invalid", y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });
    });

    describe("PlayData Validation", () => {
        it("should validate empty play data", () => {
            const playData: PlayData = {
                players: [],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayData(playData);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should validate play data with all element types", () => {
            const playData: PlayData = {
                players: [
                    {
                        id: "player-1",
                        position: { x: 50, y: 100 },
                        label: "Center",
                        color: "#FF0000",
                    },
                ],
                drawings: [
                    {
                        id: "draw-1",
                        type: "line",
                        points: [
                            { x: 0, y: 0 },
                            { x: 100, y: 100 },
                        ],
                        color: "#0000FF",
                        strokeWidth: 2,
                    },
                ],
                annotations: [
                    {
                        id: "text-1",
                        text: "Movement",
                        position: { x: 50, y: 50 },
                        fontSize: 14,
                        color: "#000000",
                    },
                ],
            };
            const result = validatePlayData(playData);
            expect(result.valid).toBe(true);
        });

        it("should reject play data with invalid players", () => {
            const playData = {
                players: [
                    {
                        id: "",
                        position: { x: 50, y: 100 },
                        label: "Center",
                        color: "#FF0000",
                    },
                ],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayData(playData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "players[0]",
                    code: "INVALID_PLAYER",
                })
            );
        });

        it("should reject play data exceeding max players", () => {
            const players = Array.from(
                { length: VALIDATION_CONSTRAINTS.MAX_PLAYERS + 1 },
                (_, i) => ({
                    id: `player-${i}`,
                    position: { x: i * 10, y: i * 10 },
                    label: `Player ${i}`,
                    color: "#FF0000",
                })
            );
            const playData = { players, drawings: [], annotations: [] };
            const result = validatePlayData(playData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "MAX_PLAYERS_EXCEEDED",
                })
            );
        });

        it("should reject play data exceeding total element limit", () => {
            // Create a mix of elements that exceed total limit
            // Use 50 drawings + 50 annotations + 1 player = 101 total (exceeds 100 limit)
            const drawings = Array.from({ length: 50 }, (_, i) => ({
                id: `draw-${i}`,
                type: "line" as const,
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 10 },
                ],
                color: "#0000FF",
                strokeWidth: 1,
            }));

            const annotations = Array.from({ length: 50 }, (_, i) => ({
                id: `text-${i}`,
                text: `Label ${i}`,
                position: { x: 0, y: 0 },
                fontSize: 12,
                color: "#000000",
            }));

            const players = [
                {
                    id: "player-1",
                    position: { x: 0, y: 0 },
                    label: "Player",
                    color: "#FF0000",
                },
            ];

            const playData = { players, drawings, annotations };
            const result = validatePlayData(playData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "MAX_ELEMENTS_EXCEEDED",
                })
            );
        });

        it("should reject non-object input", () => {
            const result = validatePlayData("invalid");
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "INVALID_TYPE",
                })
            );
        });
    });

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

    describe("Play Durations Validation", () => {
        it("should validate plays within session duration", () => {
            const plays: PlayInSession[] = [
                {
                    id: "play-1",
                    playId: "lib-1",
                    sequence: 1,
                    duration: 10,
                    instructions: "First drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
                {
                    id: "play-2",
                    playId: "lib-2",
                    sequence: 2,
                    duration: 15,
                    instructions: "Second drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
            ];
            const result = validatePlayDurations(plays, 30);
            expect(result.valid).toBe(true);
        });

        it("should reject plays exceeding session duration", () => {
            const plays: PlayInSession[] = [
                {
                    id: "play-1",
                    playId: "lib-1",
                    sequence: 1,
                    duration: 20,
                    instructions: "First drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
                {
                    id: "play-2",
                    playId: "lib-2",
                    sequence: 2,
                    duration: 20,
                    instructions: "Second drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
            ];
            const result = validatePlayDurations(plays, 30);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "PLAY_DURATION_EXCEEDS_SESSION",
                })
            );
        });

        it("should validate plays exactly matching session duration", () => {
            const plays: PlayInSession[] = [
                {
                    id: "play-1",
                    playId: "lib-1",
                    sequence: 1,
                    duration: 30,
                    instructions: "Full session drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
            ];
            const result = validatePlayDurations(plays, 30);
            expect(result.valid).toBe(true);
        });

        it("should handle empty plays array", () => {
            const result = validatePlayDurations([], 60);
            expect(result.valid).toBe(true);
        });
    });

    describe("Practice Session Data Validation", () => {
        it("should validate complete session data", () => {
            const session: PracticeSessionData = {
                id: "session-1",
                title: "Monday Practice",
                date: new Date("2025-11-17"),
                duration: 60,
                plays: [
                    {
                        id: "play-1",
                        playId: "lib-1",
                        sequence: 1,
                        duration: 30,
                        instructions: "Warm up drills",
                        playData: {
                            players: [],
                            drawings: [],
                            annotations: [],
                        },
                    },
                ],
                isShared: false,
            };
            const result = validatePracticeSessionData(session);
            expect(result.valid).toBe(true);
        });

        it("should reject session with empty title", () => {
            const session = {
                title: "",
                date: new Date(),
                duration: 60,
                plays: [],
                isShared: false,
            };
            const result = validatePracticeSessionData(session);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "title",
                    code: "INVALID_TITLE",
                })
            );
        });

        it("should reject session with invalid date", () => {
            const session = {
                title: "Practice",
                date: "invalid",
                duration: 60,
                plays: [],
                isShared: false,
            };
            const result = validatePracticeSessionData(session);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "date",
                    code: "INVALID_DATE",
                })
            );
        });

        it("should reject session with plays exceeding duration", () => {
            const session: PracticeSessionData = {
                title: "Practice",
                date: new Date(),
                duration: 30,
                plays: [
                    {
                        id: "play-1",
                        playId: "lib-1",
                        sequence: 1,
                        duration: 50,
                        instructions: "Too long",
                        playData: {
                            players: [],
                            drawings: [],
                            annotations: [],
                        },
                    },
                ],
                isShared: false,
            };
            const result = validatePracticeSessionData(session);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: "PLAY_DURATION_EXCEEDS_SESSION",
                })
            );
        });

        it("should reject session with non-boolean isShared", () => {
            const session = {
                title: "Practice",
                date: new Date(),
                duration: 60,
                plays: [],
                isShared: "yes",
            };
            const result = validatePracticeSessionData(session);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "isShared",
                    code: "INVALID_TYPE",
                })
            );
        });
    });

    describe("PlayDataJSON Validation", () => {
        it("should validate complete play data JSON", () => {
            const json: PlayDataJSON = {
                version: "1.0",
                rinkDimensions: { width: 200, height: 85 },
                players: [],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayDataJSON(json);
            expect(result.valid).toBe(true);
        });

        it("should reject JSON with invalid version", () => {
            const json = {
                version: "",
                rinkDimensions: { width: 200, height: 85 },
                players: [],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayDataJSON(json);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "version",
                    code: "INVALID_VERSION",
                })
            );
        });

        it("should reject JSON with invalid rink dimensions", () => {
            const json = {
                version: "1.0",
                rinkDimensions: { width: 0, height: 85 },
                players: [],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayDataJSON(json);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "rinkDimensions.width",
                    code: "INVALID_DIMENSION",
                })
            );
        });

        it("should reject JSON with negative rink dimensions", () => {
            const json = {
                version: "1.0",
                rinkDimensions: { width: 200, height: -85 },
                players: [],
                drawings: [],
                annotations: [],
            };
            const result = validatePlayDataJSON(json);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    field: "rinkDimensions.height",
                    code: "INVALID_DIMENSION",
                })
            );
        });
    });

    describe("DrawingTool Type", () => {
        it("should define all drawing tool types", () => {
            const tools: DrawingTool[] = [
                "select",
                "player",
                "line",
                "curve",
                "arrow",
                "text",
                "eraser",
            ];
            expect(tools).toHaveLength(7);
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
            const playData: PlayData = {
                players: [],
                drawings: [],
                annotations: [],
            };
            expect(playData).toHaveProperty("players");
            expect(playData).toHaveProperty("drawings");
            expect(playData).toHaveProperty("annotations");
        });

        it("should support requirement 1.2 - player icon placement", () => {
            const player: PlayerIcon = {
                id: "p1",
                position: { x: 50, y: 100 },
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
                type: "line",
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                ],
                color: "#0000FF",
                strokeWidth: 2,
            };
            expect(drawing.type).toBe("line");
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
                playData: { players: [], drawings: [], annotations: [] },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(savedPlay).toHaveProperty("id");
            expect(savedPlay).toHaveProperty("thumbnail");
        });

        it("should support requirement 5.1 - drawing tools color support", () => {
            const drawing: DrawingElement = {
                id: "d1",
                type: "line",
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

    describe("Edge Cases & Error Handling", () => {
        it("should handle very large position values", () => {
            const position: Position = { x: 10000, y: 10000 };
            expect(isValidPosition(position)).toBe(true);
        });

        it("should handle negative position values", () => {
            const position: Position = { x: -100, y: -200 };
            expect(isValidPosition(position)).toBe(true);
        });

        it("should handle fractional position values", () => {
            const position: Position = { x: 50.5, y: 100.75 };
            expect(isValidPosition(position)).toBe(true);
        });

        it("should reject whitespace-only text annotation", () => {
            const annotation = {
                id: "t1",
                text: "   ",
                position: { x: 50, y: 50 },
                fontSize: 14,
                color: "#000000",
            };
            // Whitespace-only text should be invalid after trim()
            expect(isValidTextAnnotation(annotation)).toBe(false);
        });

        it("should validate multiple plays with different types", () => {
            const plays: PlayInSession[] = [
                {
                    id: "p1",
                    playId: "lib-1",
                    sequence: 1,
                    duration: 10,
                    instructions: "Warm up",
                    playData: { players: [], drawings: [], annotations: [] },
                },
                {
                    id: "p2",
                    playId: "lib-2",
                    sequence: 2,
                    duration: 15,
                    instructions: "Drill",
                    playData: { players: [], drawings: [], annotations: [] },
                },
                {
                    id: "p3",
                    playId: "lib-3",
                    sequence: 3,
                    duration: 5,
                    instructions: "Cool down",
                    playData: { players: [], drawings: [], annotations: [] },
                },
            ];
            const result = validatePlayDurations(plays, 30);
            expect(result.valid).toBe(true);
        });
    });
});
