/**
 * The static practice planner (ADR-0020, sub-project 3). Driven by the root
 * scripts: `bun run planner:build` writes dist/planner, which the Pages
 * workflow copies to /planner/ on openleague.dev.
 */
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { resolveAiOrigins } from "./ai-origins";
import { plannerCsp, resolveHostedUrl } from "./build-config";
import { resolveCloudSettings } from "./cloud-config";

const ROOT = path.resolve(__dirname, "../..");

/** One list for connect-src and the adapters (ADR-0023); a bad OPENLEAGUE_AI_CONNECT_ORIGINS fails here. */
const AI_ORIGINS = resolveAiOrigins(process.env.OPENLEAGUE_AI_CONNECT_ORIGINS);

/**
 * Cloud connectors (storage connectors spec R9): built in only when their
 * public identifiers are set; a half-set provider fails here. The same
 * settings feed the CSP and the app, so neither can name a provider the
 * other lacks.
 */
const CLOUD = resolveCloudSettings(process.env);

function contentSecurityPolicy(): Plugin {
    return {
        name: "openleague-planner-csp",
        apply: "build",
        transformIndexHtml: () => [
            { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: plannerCsp(AI_ORIGINS, { cloud: CLOUD }) }, injectTo: "head-prepend" },
        ],
    };
}

export default defineConfig(({ mode }) => ({
    root: path.join(ROOT, "apps/planner"),
    // Relative assets: works at /planner/, on forks' subpaths, and under vite preview.
    base: "./",
    plugins: [react(), contentSecurityPolicy()],
    resolve: { alias: { "@": ROOT } },
    define: {
        __OPENLEAGUE_HOSTED_URL__: JSON.stringify(resolveHostedUrl(process.env.OPENLEAGUE_HOSTED_URL)),
        __OPENLEAGUE_AI_ORIGINS__: JSON.stringify(AI_ORIGINS),
        // Primitives, not one object, so a provider that isn't built in folds to a constant and its lazy chunk is dropped.
        __OPENLEAGUE_GOOGLE_CLIENT_ID__: JSON.stringify(CLOUD.google?.clientId ?? ""),
        __OPENLEAGUE_GOOGLE_API_KEY__: JSON.stringify(CLOUD.google?.apiKey ?? ""),
        __OPENLEAGUE_GOOGLE_APP_ID__: JSON.stringify(CLOUD.google?.appId ?? ""),
        __OPENLEAGUE_MICROSOFT_CLIENT_ID__: JSON.stringify(CLOUD.microsoft?.clientId ?? ""),
        "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    },
    server: { fs: { allow: [ROOT] } },
    build: {
        outDir: path.join(ROOT, "dist/planner"),
        emptyOutDir: true,
        target: "es2022",
        sourcemap: false,
        rollupOptions: {
            onwarn(warning, warn) {
                // The shared modules' "use client" lines mean nothing outside Next.
                if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
                warn(warning);
            },
        },
    },
}));
