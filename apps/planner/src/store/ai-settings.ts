/**
 * AI settings in the meta store (ADR-0023, Ruling 12): one record, no key.
 * Written through toStoredAiSettings, so only known non-secret fields are
 * stored; read leniently. Screens subscribe to hear about changes in this tab.
 */
import type { ActionResult } from "@/lib/planner-store";
import { readAiSettings, toStoredAiSettings, type AiSettings } from "../ai/settings";
import { META_AI_SETTINGS } from "./records";
import { attempt, ok, write, type StoreContext } from "./shared";

export const AI_SETTINGS_LOAD_FAILED = "Couldn't load the AI settings. Please try again.";
export const AI_SETTINGS_SAVE_FAILED = "Couldn't save the AI settings. Please try again.";

export interface AiSettingsOps {
    getAiSettings: () => Promise<ActionResult<AiSettings>>;
    saveAiSettings: (settings: AiSettings) => Promise<ActionResult<AiSettings>>;
    subscribeAiSettings: (listener: () => void) => () => void;
    aiSettingsVersion: () => number;
}

export function createAiSettingsOps(ctx: StoreContext): AiSettingsOps {
    const listeners = new Set<() => void>();
    let version = 0;
    return {
        getAiSettings: () => attempt(AI_SETTINGS_LOAD_FAILED, async () => ok(readAiSettings(await ctx.repo.read((tx) => tx.getMeta(META_AI_SETTINGS))))),

        saveAiSettings: async (settings) => {
            const result = await attempt(AI_SETTINGS_SAVE_FAILED, async () => {
                const stored = toStoredAiSettings(settings);
                await write(ctx, (tx) => tx.putMeta(META_AI_SETTINGS, stored));
                return ok(stored);
            });
            if (result.success) {
                version += 1;
                for (const listener of [...listeners]) {
                    try {
                        listener();
                    } catch {
                        // One listener's failure never turns a saved record into a failure.
                    }
                }
            }
            return result;
        },

        subscribeAiSettings: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        aiSettingsVersion: () => version,
    };
}
