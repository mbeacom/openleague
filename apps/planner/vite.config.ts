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

const ROOT = path.resolve(__dirname, "../..");

/** One list for connect-src and the adapters (ADR-0023); a bad OPENLEAGUE_AI_CONNECT_ORIGINS fails here. */
const AI_ORIGINS = resolveAiOrigins(process.env.OPENLEAGUE_AI_CONNECT_ORIGINS);

function contentSecurityPolicy(): Plugin {
    return {
        name: "openleague-planner-csp",
        apply: "build",
        transformIndexHtml: () => [
            { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: plannerCsp(AI_ORIGINS) }, injectTo: "head-prepend" },
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
