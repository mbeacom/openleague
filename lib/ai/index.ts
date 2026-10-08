/**
 * Bring-your-own-key AI assistance (ADR-0023). The planner loads this module
 * only through import(), when the coach opens an AI feature; it must never
 * reach the static app's entry chunk (scripts/check-planner-build.ts).
 */
export * from "./types";
export * from "./origins";
export * from "./redact";
export * from "./schema";
export * from "./providers";
export * from "./library-match";
export * from "./tasks/notes-to-plan";
export { AI_ERROR_MESSAGES } from "./adapters/shared";
export { INVALID_BASE_URL_MESSAGE, chatCompletionsUrl } from "./adapters/openai-compatible";
