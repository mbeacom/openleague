/** Defined by apps/planner/vite.config.ts; undefined under Vitest (read it with a typeof guard). */
declare const __OPENLEAGUE_HOSTED_URL__: string;
/** The AI origin allowlist (ADR-0023), resolved by apps/planner/vite.config.ts; undefined under Vitest. */
declare const __OPENLEAGUE_AI_ORIGINS__: readonly string[];
/** Cloud connectors' public identifiers (storage connectors spec R9), resolved by apps/planner/vite.config.ts; "" when unset, undefined under Vitest. */
declare const __OPENLEAGUE_GOOGLE_CLIENT_ID__: string;
declare const __OPENLEAGUE_GOOGLE_API_KEY__: string;
declare const __OPENLEAGUE_GOOGLE_APP_ID__: string;
declare const __OPENLEAGUE_MICROSOFT_CLIENT_ID__: string;
/** "personal" or "any" when OneDrive is built (OPENLEAGUE_MICROSOFT_ACCOUNTS, default personal); "" otherwise, undefined under Vitest. */
declare const __OPENLEAGUE_MICROSOFT_ACCOUNTS__: string;
