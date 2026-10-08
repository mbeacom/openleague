import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * `.test.ts` files that need a DOM (window, document, sessionStorage,
 * localStorage, canvas, DOMParser, a rendered hook) and so run under jsdom.
 *
 * Every other `.test.ts` file runs under plain Node, which skips building a
 * jsdom window for each file -- the largest single cost of the suite. Every
 * `.test.tsx` file runs under jsdom.
 *
 * A new `.test.ts` that fails with "window is not defined" (or document,
 * sessionStorage, HTMLCanvasElement ...) belongs on this list. A
 * `// @vitest-environment jsdom` docblock at the top of the file also works.
 */
const DOM_TS_TESTS = [
  '__tests__/apps/planner/ai-key-containment.test.ts',
  '__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts',
  '__tests__/components/features/practice-planner/export/download.test.ts',
  '__tests__/components/features/practice-planner/export/export-bench-sheet.test.ts',
  '__tests__/components/features/practice-planner/export/export-images.test.ts',
  '__tests__/components/features/practice-planner/useBoardTouch.test.ts',
  '__tests__/components/features/practice-planner/useSessionStaff.test.ts',
  '__tests__/components/features/practice-planner/useSingleFlightSave.test.ts',
  '__tests__/components/features/practice-planner/useStrokeEditing.test.ts',
  '__tests__/lib/analytics/tracking.test.ts',
  '__tests__/lib/analytics/umami.test.ts',
  '__tests__/lib/hooks/useKeyboardShortcuts.test.ts',
  '__tests__/lib/plan-document/pending-league-source.test.ts',
  '__tests__/lib/plan-document/pending.test.ts',
  '__tests__/lib/utils/canvas/backing-store.test.ts',
  '__tests__/lib/utils/canvas/crest-png.test.ts',
  '__tests__/lib/utils/canvas/diagram-fonts.test.ts',
  '__tests__/lib/utils/canvas/drawing-utils.test.ts',
  '__tests__/lib/utils/canvas/legend-swatch.test.ts',
  '__tests__/lib/utils/canvas/logo-file.test.ts',
  '__tests__/lib/utils/canvas/rink-renderer-cache.test.ts',
  '__tests__/lib/utils/canvas/rink-renderer-clip.test.ts',
  '__tests__/lib/utils/canvas/thumbnail-area.test.ts',
  '__tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts',
];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Worker threads instead of the default child processes: the same suite,
    // the same per-file isolation (`isolate` stays at its default, true), with
    // cheaper worker startup -- measured 5-15% faster than forks. If a test
    // ever needs process-level APIs that threads lack (process.chdir, a native
    // module that is not thread-safe), give it its own project with
    // `pool: 'forks'` rather than reverting this for the whole suite.
    pool: 'threads',
    // Two projects split by environment. Together their includes cover
    // Vitest's default include pattern exactly once, so no file is dropped
    // and none runs twice. `extends: true` inherits everything above.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.{test,spec}.?(c|m)[jt]s'],
          // Replacing `exclude` drops the defaults, so they are re-added.
          exclude: [...configDefaults.exclude, ...DOM_TS_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.{test,spec}.?(c|m)[jt]sx', ...DOM_TS_TESTS],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'coverage/',
        '**/*.config.{js,ts}',
        '**/types/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
