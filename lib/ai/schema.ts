/**
 * Draft schemas go to providers as JSON Schema (spec R8): Zod v4's
 * z.toJSONSchema, reduced to the subset every phase-1 provider accepts.
 * Nullable fields become anyOf with null; Zod's safe-integer bounds on .int()
 * and the top-level $schema are dropped (Ruling 4).
 */
import { z } from "zod";
import type { JsonSchema } from "./types";

/** The keywords a draft schema may use. */
export const SCHEMA_SUBSET_KEYWORDS = ["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "description"] as const;
const ALLOWED = new Set<string>(SCHEMA_SUBSET_KEYWORDS);

function reduce(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(reduce);
    if (!node || typeof node !== "object") return node;
    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (key === "$schema" || key === "minimum" || key === "maximum") continue;
        if (key === "properties" && value && typeof value === "object") {
            out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, reduce(child)]));
        } else {
            out[key] = reduce(value);
        }
    }
    // ["string", "null"] → anyOf, which every provider documents.
    if (Array.isArray(out.type)) {
        const types = out.type as string[];
        const { type: _type, enum: values, ...rest } = out;
        void _type;
        const withValues = (t: string) => (t !== "null" && values !== undefined ? { type: t, enum: (values as unknown[]).filter((v) => v !== null) } : { type: t });
        return { ...rest, anyOf: types.map(withValues) };
    }
    return out;
}

export function toProviderSchema(schema: z.ZodType): JsonSchema {
    return reduce(z.toJSONSchema(schema)) as JsonSchema;
}

/** Every keyword outside the shared subset, and every object that breaks the required/additionalProperties rules, as paths. */
export function schemaSubsetViolations(schema: unknown, path = "#"): string[] {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [`${path}: not a schema object`];
    const node = schema as Record<string, unknown>;
    const problems: string[] = [];
    for (const key of Object.keys(node)) {
        if (!ALLOWED.has(key)) problems.push(`${path}: keyword "${key}" is outside the shared subset`);
    }
    if (node.type === "object") {
        const properties = (node.properties ?? {}) as Record<string, unknown>;
        const required = Array.isArray(node.required) ? node.required : [];
        if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
        for (const name of Object.keys(properties)) {
            if (!required.includes(name)) problems.push(`${path}.${name}: every property must be required (use nullable instead)`);
            problems.push(...schemaSubsetViolations(properties[name], `${path}.${name}`));
        }
    }
    if (node.items !== undefined) problems.push(...schemaSubsetViolations(node.items, `${path}[]`));
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((option, index) => problems.push(...schemaSubsetViolations(option, `${path}|${index}`)));
    if (Array.isArray(node.type)) problems.push(`${path}: type arrays are sent as anyOf`);
    return problems;
}
