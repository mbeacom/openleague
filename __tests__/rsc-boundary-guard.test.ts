import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Guards against the Next 16 RSC-boundary crash that took down production on
 * 2026-07-05 (PR #259): `next/link` renders natively in Server Components and
 * is NOT a client reference, so passing it as a prop (`component={Link}`) from
 * a server component into an MUI client component throws at render time —
 * "Functions cannot be passed directly to Client Components". The failure is
 * invisible to type-check and `next build` (dynamic routes never prerender)
 * and only fires when the element actually renders.
 *
 * Server components must use the `"use client"` composites in
 * `components/ui/NextLinkComposites.tsx` (LinkButton, LinkCardActionArea, …)
 * instead. Client components may keep the direct pattern.
 *
 * The same boundary rejects a function-valued `sx` property — MUI's
 * `sx={{ color: (theme) => … }}` callback form. React cannot serialize the
 * function, so a server component handing one to an MUI client component fails
 * with the identical error, and just as invisibly. Interpolate a CSS variable
 * (`var(--mui-palette-divider)`; cssVariables is enabled in lib/theme.ts) or
 * compute the value against the imported theme so a plain string crosses.
 */

const SCAN_ROOTS = ["app", "components"];
const REPO_ROOT = join(__dirname, "..");

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function hasUseClientDirective(source: string): boolean {
  // The directive must appear before any statement; scanning the prologue is
  // enough and tolerates comments, BOMs, and either quote style.
  const prologue = source.slice(0, 500);
  return /(^|\n)\s*(["'])use client\2\s*;?/.test(prologue);
}

/** Default-import identifiers bound to next/link in this file. */
function nextLinkIdentifiers(source: string): string[] {
  const ids: string[] = [];
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']next\/link["']/g;
  for (const match of source.matchAll(importRe)) {
    ids.push(match[1]);
  }
  return ids;
}

describe("RSC boundary guard: next/link as a component prop", () => {
  it("no server component passes next/link via component={...}", () => {
    const violations: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectTsxFiles(join(REPO_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        if (hasUseClientDirective(source)) continue;

        for (const id of nextLinkIdentifiers(source)) {
          const propRe = new RegExp(`component=\\{\\s*${id}\\s*\\}`);
          if (propRe.test(source)) {
            violations.push(file.replace(`${REPO_ROOT}/`, ""));
            break;
          }
        }
      }
    }

    expect(
      violations,
      `next/link passed as component={...} from server component(s):\n  ${violations.join(
        "\n  "
      )}\nThis crashes at render time in Next 16 ("Functions cannot be passed ` +
        `directly to Client Components"). Use the "use client" composites in ` +
        `components/ui/NextLinkComposites.tsx (LinkButton, LinkCardActionArea, ` +
        `LinkCard, LinkChip, LinkListItemButton, LinkMuiLink) or add "use client" ` +
        `if the file is genuinely a client component.`
    ).toEqual([]);
  });
});

/**
 * Property values inside an `sx={{ … }}` object literal that are arrow
 * functions, i.e. `someProp: (theme) => …`.
 *
 * Deliberately narrow: it looks only for the `(args) =>` form directly after a
 * property key, inside a braced sx prop. The whole-callback form
 * `sx={(theme) => ({ … })}` is NOT matched, because MUI's own components accept
 * it and it is not what crossed the boundary here. Regex rather than a parse
 * because the guard has to stay cheap enough to run over every file on every
 * test run.
 */
function functionValuedSxProps(source: string): string[] {
  const hits: string[] = [];
  const sxRe = /sx=\{\{/g;

  for (const match of source.matchAll(sxRe)) {
    // Walk to the matching close brace so nested objects stay in scope.
    let depth = 0;
    let index = match.index + "sx={".length;
    const start = index;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const block = source.slice(start, index);
    const propRe = /([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*:\s*\([^)]*\)\s*=>/g;
    for (const prop of block.matchAll(propRe)) {
      hits.push(prop[1]);
    }
  }

  return hits;
}

describe("RSC boundary guard: function-valued sx properties", () => {
  it("no server component passes a theme callback as an sx property value", () => {
    const violations: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectTsxFiles(join(REPO_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        if (hasUseClientDirective(source)) continue;

        const props = functionValuedSxProps(source);
        if (props.length > 0) {
          violations.push(
            `${file.replace(`${REPO_ROOT}/`, "")} (${[...new Set(props)].join(", ")})`
          );
        }
      }
    }

    expect(
      violations,
      `function-valued sx propert(ies) in server component(s):\n  ${violations.join(
        "\n  "
      )}\nReact cannot serialize a function across the server/client boundary, so ` +
        `this throws at render time ("Functions cannot be passed directly to Client ` +
        `Components") while passing type-check, lint, and build. Interpolate a CSS ` +
        `variable such as var(--mui-palette-divider), or compute the value against ` +
        `the imported theme so the result is a plain string.`
    ).toEqual([]);
  });
});
