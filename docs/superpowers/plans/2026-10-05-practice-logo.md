# Team Logo on Practices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every practice shows its team's mark (the logo, or the team's Crest when there is none) on the session page header, the live and printed bench sheet, the HTML and Word exports and the static import preview, in both planners. The static planner gets a device-wide **Your team** profile for this.

**Architecture:**
- One display shape travels through both apps: `TeamMark` (`id`, `name`, `logoUrl`, `color`, optional export-ready `logoImage`) on `PracticeSessionView`. Hosted builds it from the team in the session detail read. Static builds it from the device profile in `getSessionView`.
- Exports embed one normalized image shape, `LogoImage` (a PNG data URL that fits 512×512, at most 200 KB), or a Crest drawn to a canvas (`crestPng`).
  - Hosted gets `LogoImage` from a new server action, `getPracticeLogoImage(sessionId)`. The action authorizes like the detail read, fetches only owned blob URLs with a timeout and a byte cap, sniffs magic bytes and normalizes with `sharp`.
  - Static stores `LogoImage` in its profile, normalized in the browser with `createImageBitmap` and a canvas.
- Shared components reach the hosted action only through the planner seam: `PlannerStore.getPracticeLogoImage?` is optional and hosted-only, like `sharePracticeSession`. They never import `lib/actions`.
- The static "This device" leave-out rule is removed. A static session's `teamName` is the profile's name, or `""` with no profile, and an empty name already prints nothing.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (Neon/PostgreSQL), Zod v4, `sharp` 0.35 (server only), Vite (static planner), Vitest + Testing Library, fake-indexeddb, `docx`, Playwright (screenshots only, from the scratchpad), Bun.

**Spec:** `docs/superpowers/specs/2026-10-05-practice-logo-design.md`. Its rulings R1–R6 are referenced below.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/practice-logo`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- No schema change and no migration. Every hosted field read here (`Team.logoUrl`, `Team.brandPrimaryColor`) already exists. Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`.
- **Image library (spec R1):** promote `sharp` to a direct dependency at the version already locked (`^0.35.4`).
  - It is already installed: `next@16.3.5` lists it in `optionalDependencies`, and `bun.lock` resolves `sharp@0.35.4` with the `@img/sharp-linux-x64` and `@img/sharp-linuxmusl-x64` prebuilt binaries.
  - Next.js externalizes it for server code (`node_modules/next/dist/lib/server-external-packages.jsonc` lists `"sharp"`).
  - Promoting it adds no installed bytes. It only stops the import depending on Next's optional-dependency choice.
  - `sharp` is imported in exactly one module, `lib/media/logo-image.ts`, and only with `await import("sharp")` inside a function. No client, portable or `"use server"` module imports it at the top level.
  - No other new runtime dependency.
- **Security (binding).** `getPracticeLogoImage(sessionId)` in the new `"use server"` module `lib/actions/practice-logo.ts`:
  1. parses `sessionId` with `parseId` (`idSchema`, `lib/utils/ids.ts`) **before** any auth call or query, and returns `null` when it is malformed;
  2. reads the user with `getCurrentUserId()` and returns `null` when there is none. It never redirects: a logo must never navigate an export away;
  3. authorizes exactly like `getPracticeSessionDetail`, through the shared `canViewPracticeSession(role, isShared)` (team admins always; members only when the practice is shared);
  4. fetches only a `logoUrl` that passes `isOwnedBlobUrl(url, entityLogoPrefix("team", teamId))`;
  5. fetches with `redirect: "error"`, `cache: "no-store"` and `AbortSignal.timeout(5000)`, and enforces a 2 MB cap (`LOGO_MAX_BYTES`) both on `content-length` and while streaming;
  6. sniffs the magic bytes (PNG, JPEG, WebP only; never the `content-type` header), then decodes with `sharp` under `limitInputPixels: 40_000_000`, and re-checks `metadata().format` (sharp can decode SVG and GIF);
  7. returns `{ dataUrl, width, height } | null` and never the URL. Any failure returns `null` and logs one line (spec R6): a fixed message, or `error.name` for a thrown error, never a URL, team id or session id.

  It goes in the sweep table `__tests__/helpers/action-id-sweep-table.ts` (`"practice-logo#getPracticeLogoImage": [ID]`) and in the readers table in `__tests__/lib/actions/action-id-arguments-readers.test.ts`.
- **Shapes and limits (spec R2, R4):**
  - `LogoImage = { dataUrl: string; width: number; height: number }`: a `data:image/png;base64,` URI that passes `isPngDataUri`, with integer sides from 1 to `LOGO_IMAGE_MAX_PX`, at most `MAX_LOGO_PNG_BYTES` decoded.
  - Constants, from `lib/media/logo-rules.ts`: `LOGO_IMAGE_MAX_PX = 512`, `LOGO_IMAGE_FALLBACK_PX = 256`, `MAX_LOGO_PNG_BYTES = 200 * 1024`, and the moved `LOGO_MAX_BYTES = 2 * 1024 * 1024` and `LOGO_CONTENT_TYPES` (`lib/media/blob.ts` re-exports both).
  - Constants, from `lib/media/logo-image.ts`: `LOGO_FETCH_TIMEOUT_MS = 5000`, `LOGO_INPUT_PIXEL_LIMIT = 40_000_000`.
  - Constants, from `lib/utils/team-mark.ts`: `TEAM_NAME_MAX = 60`, `EXPORT_MARK_HEIGHT = 48`, `EXPORT_MARK_MAX_WIDTH = 144`.
  - Constants, from `lib/utils/canvas/crest-png.ts`: `CREST_EXPORT_PX = 192`, `CREST_FONT_RATIO = 17 / 48`.
  - The static meta key, from `apps/planner/src/store/records.ts`: `META_TEAM_PROFILE = "teamProfile"`. It is one new meta key, with no IndexedDB version bump.
- **One normalization rule, both apps.** Fit within 512 and encode PNG. If the PNG is over 200 KB, encode again within 256. If that is still over 200 KB, refuse:
  - hosted: `null`, and the export falls back to the Crest;
  - static: the upload is refused with `LOGO_TOO_DETAILED_MESSAGE`.

  Never upscale. Keep the aspect ratio.
- **Hosted/static parity:**
  - Both apps accept the same upload types (`LOGO_CONTENT_TYPES`, by sniffed bytes) and the same raw size (`LOGO_MAX_BYTES`), and both refuse SVG.
  - Both produce the same `LogoImage` limits: hosted output and the static store both pass `isLogoImage`.
  - The static store refuses anything `isLogoImage` refuses, with `TEAM_LOGO_INVALID_MESSAGE`, checked on the payload as sent.
- **Plan files never carry the profile or the logo** (spec R4). Importing a plan never changes the profile.
- **Escaping:** HTML export: the mark's `alt` goes through the module's `html` template (`escapeHtml`); its `src` must pass `isPngDataUri`. Word: the alt text goes through `xmlSafe` (the existing `picture()` does it). React escapes everything on screen. `EXPORT_CSP` is unchanged (it already allows `img-src data:`).
- **Portable code:** nothing under `components/features/practice-planner/`, `lib/utils/`, `lib/media/logo-rules.ts`, `lib/planner-store/`, `types/practice-planner.ts` or `apps/planner/` imports `next/*`, `@/lib/actions/*`, `@/lib/db/*`, `@/lib/auth/*`, `@prisma/client`, `lib/media/blob.ts` (it imports `@vercel/blob`) or `lib/media/logo-image.ts`. `components/ui/Crest.tsx` is already portable (it imports only MUI, `lib/utils/crest`, `lib/utils/contrast-color` and `lib/theme`, which the static theme already loads).
- **On-screen components:**
  - Use only palette tokens (`text.secondary`, `divider`, `background.paper`, `action.hover`, `error.main`…), so dark mode works. Print and export markup keeps its black-on-white.
  - Every new interactive control is at least 44×44 px, the colour picker included.
  - No MUI `Select` is added. If one is, it gets the `GoaliesAttendingField` height fix (`"& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" }`).
- **Line budgets:** `components/features/practice-planner/PracticeSessionEditor.tsx` (806 lines today, untouched by this plan) and `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (740 today, about 750 after Task 5) each stay at or under 900 lines.
- **Breaking tests:** a task that changes a type, a prop or a written shape lists, narrows and stages every existing test the change breaks (named in its Files list and its `git add`). Every task ends with `bun run type-check` and its suites green (`tsconfig.json` includes `__tests__`, so type-check covers the tests).
- **Copy, exactly:**
  - static app bar button `Your team` (it opens the dialog);
  - dialog:
    - title `Your team`, intro `Shown on your practices, bench sheets and exports on this device. Plan files never include it.`;
    - field `Team name`, helper `Up to 60 characters`;
    - logo buttons `Upload logo` / `Replace logo` and `Remove logo`, note `PNG, JPEG or WebP, up to 2 MB.`;
    - colour fields `Primary color` / `Secondary color`, helper `Optional, like #0D47A1`, colour pickers named `Pick primary color` / `Pick secondary color`;
    - actions `Clear team` (only when a profile is saved), `Cancel`, `Save`;
  - image alt text `teamLogoAlt(name)` = `<team> logo`;
  - messages (exported constants):
    - `LOGO_TYPE_MESSAGE` = `Use a PNG, JPEG or WebP image.`
    - `LOGO_FILE_SIZE_MESSAGE` = `Use an image of 2 MB or less.`
    - `LOGO_UNREADABLE_MESSAGE` = `This image couldn't be read. Try another file.`
    - `LOGO_TOO_DETAILED_MESSAGE` = `This logo is too detailed to store. Try a simpler image.`
    - `TEAM_NAME_REQUIRED_MESSAGE` = `Team name is required`
    - `TEAM_NAME_LENGTH_MESSAGE` = `Team name must be at most 60 characters`
    - `TEAM_COLOR_MESSAGE` = `Use a hex color like #0D47A1` (hosted branding's text)
    - `TEAM_LOGO_INVALID_MESSAGE` = `The logo must be a PNG of at most 512 × 512 pixels and 200 KB`
    - `TEAM_PROFILE_LOAD_FAILED` = `Couldn't load your team. Please try again.`
    - `TEAM_PROFILE_SAVE_FAILED` = `Couldn't save your team. Please try again.`
- **Profile fields (spec R4):**
  - name: `cleanTeamName` = `cleanStaffName` (control and invisible characters removed, whitespace collapsed, trimmed), 1–60 characters, refused (never cut) when longer;
  - colours: `#RRGGBB` only, stored uppercase, or `null`;
  - logo: `LogoImage | null`.

  A stored record is read leniently (`readTeamProfile`): a bad name means no profile; a bad logo or colour reads as `null`.
- **Screenshots (UI tasks 4–6):**
  - Build and serve the static planner, drive it with headless Playwright from the scratchpad harness, and write PNGs to `<scratchpad>/pwcheck/`. That folder has `node_modules/playwright`. Launch with `executablePath: process.env.CHROMIUM_PATH`.
  - Name files `logo-taskN-<view>-<desktop|mobile>-<light|dark>.png`.
  - Read every PNG before committing.
  - The hosted header and the hosted export logo can't be reached from the static build; they are covered by component tests.
- **Public repository:** commit messages, comments and test names are neutral and factual. They never describe weaknesses, attacks or internal plans. No local machine paths in anything committed.
- Commit trailer, on its own paragraph: `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`

## Review Focus

1. **A logo that can't be had:** the blob was deleted, is slow, isn't ours, or isn't an image. The Crest shows instead, and nothing fails.
   - The action returns `null`.
   - The export completes with the Crest (Task 6).
   - The live bench sheet's `<img>` falls back to the Crest on `error` (Task 5).
   - The session page keeps today's `Crest` behaviour.
   - Tests: Task 2 (unowned URL, non-image, timeout, network error), Task 5 (`TeamMarkImage` error), Task 6 (the action rejects or resolves `null`).
2. **Extreme aspect ratios** (a 1200×200 wordmark, a 100×800 banner) keep their shape: 512×85 on the server, then at most 144×48 in an export. Tests: Task 1 (`fitWithin`, `exportMarkSize`), Task 2 (server output size), Task 6 (HTML `width`/`height`).
3. **Team names with markup, quotes or control characters** (`Hawks <U12> & "Co"`, a `\u0001`) are escaped in the HTML `alt`, stripped by `xmlSafe` in Word, and cleaned in the static profile. Tests: Task 1 (`cleanTeamName`), Task 6 (HTML and Word).
4. **A disguised or oversize upload is refused with a plain message**, never stored, on both sides:
   - an SVG renamed `.png`;
   - a GIF;
   - a 2 MB + 1 byte file;
   - a decompression bomb (the server's pixel limit).

   Tests: Task 1 (`sniffLogoType`), Task 2 (SVG bytes, oversize stream, pixel limit), Task 4 (`normalizeLogoFile`).
5. **The static profile changes while a practice is open:** the session page picks up the new name and mark without a reload, an import doesn't change the profile, and a device with no profile shows nothing new. Tests: Task 3 (legacy device, import), Task 4 (`useStoreResult` refresh key), Task 5 (session page refresh).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types/practice-planner.ts` | `LogoImage`, `TeamMark`, `TeamProfile`; `teamMark?` on `PracticeSessionView` | 1 |
| `lib/media/logo-rules.ts` (new) | upload limits and types (moved from `blob.ts`), `sniffLogoType`, `fitWithin`, normalized-image limits | 1 |
| `lib/media/blob.ts` | re-exports the moved logo constants | 1 |
| `lib/utils/png-data-uri.ts` (new) | `isPngDataUri`, `pngDataUriToBytes` (moved), `pngDataUriByteLength` | 1 |
| `components/features/practice-planner/export/png.ts` | re-exports the moved PNG helpers | 1 |
| `lib/utils/team-mark.ts` (new) | profile validation, lenient read, `toTeamMark`, alt text, export mark size | 1 |
| `lib/utils/canvas/crest-png.ts` (new) | `paintCrest`, `crestPng` (spec R3: a new module beside the other canvas painters, used by the live bench sheet and the exports) | 1 |
| `lib/utils/practice-access.ts` (new) | `canViewPracticeSession`, shared by the detail read and the logo action | 2 |
| `lib/media/logo-image.ts` (new, server only) | `fetchLogoBytes`, `normalizeLogoBytes` (sharp) | 2 |
| `lib/actions/practice-logo.ts` (new) | `getPracticeLogoImage` | 2 |
| `lib/actions/practice-session-queries.ts` | detail read: shared access check, `teamMark` | 2 |
| `lib/planner-store/types.ts`, `components/providers/HostedPlannerProvider.tsx`, `__tests__/helpers/planner.tsx` | the hosted-only seam method | 2 |
| `apps/planner/src/store/{records,team-profile,types,local-store,sessions}.ts`, `apps/planner/src/config.ts` | the device profile, the session view's team | 3 |
| `lib/utils/canvas/logo-file.ts` (new) | browser upload normalization | 4 |
| `apps/planner/src/screens/{YourTeam.tsx,useTeamProfile.ts}` (new), `AppShell.tsx`, `App.tsx`, `useStoreResult.ts`, `SessionDetailScreen.tsx`, `BenchSheetScreen.tsx` | the Your team dialog, its app bar button, refresh on change | 4 |
| `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`, `components/features/practice-planner/print/{TeamMarkImage.tsx,BenchSheet.tsx}` | the session header mark, the live/printed bench sheet mark | 5 |
| `components/features/practice-planner/export/{bench-sheet-model,bench-sheet-html,bench-sheet-docx,export-images,export-bench-sheet,export-logo}.ts`, `ExportPlanMenu.tsx`, `PlanPreview.tsx`, `apps/planner/src/screens/ImportScreen.tsx` | the exports and the import preview | 6 |

---

### Task 1: Logo rules, the team mark vocabulary and the Crest painter

The pure layer every later task imports. Nothing renders differently yet: the new `teamMark` field is optional and nothing sets it.

**Files:**
- Modify: `types/practice-planner.ts` (after `SessionStaffMember`/`StaffOption`; `PracticeSessionView`)
- Create: `lib/media/logo-rules.ts`
- Modify: `lib/media/blob.ts` (replace the `LOGO_MAX_BYTES` and `LOGO_CONTENT_TYPES` definitions with a re-export)
- Create: `lib/utils/png-data-uri.ts`
- Modify: `components/features/practice-planner/export/png.ts` (becomes a re-export)
- Create: `lib/utils/team-mark.ts`
- Create: `lib/utils/canvas/crest-png.ts`
- Test (create): `__tests__/lib/media/logo-rules.test.ts`, `__tests__/lib/utils/team-mark.test.ts`, `__tests__/lib/utils/canvas/crest-png.test.ts`
- Existing tests that must stay green unchanged: `__tests__/components/features/practice-planner/export/png.test.ts` (imports from `export/png`, now a re-export) and `__tests__/lib/media/blob-ownership.test.ts`.

**Interfaces:**
- Produces, from `types/practice-planner.ts`:
  - `LogoImage { dataUrl: string; width: number; height: number }`;
  - `TeamMark { id: string; name: string; logoUrl: string | null; color: string | null; logoImage?: LogoImage | null }`;
  - `TeamProfile { name: string; logo: LogoImage | null; primaryColor: string | null; secondaryColor: string | null }`;
  - `teamMark?: TeamMark | null` on `PracticeSessionView`.
- Produces, from `lib/media/logo-rules.ts`: `LOGO_MAX_BYTES`, `LOGO_CONTENT_TYPES`, `LogoContentType`, `LOGO_ACCEPT` (`"image/jpeg,image/png,image/webp"`), `LOGO_IMAGE_MAX_PX`, `LOGO_IMAGE_FALLBACK_PX`, `MAX_LOGO_PNG_BYTES`, `sniffLogoType(bytes: Uint8Array): LogoContentType | null`, `fitWithin(width: number, height: number, max: number): { width: number; height: number }` (throws `RangeError` for a non-positive side).
- Produces, from `lib/utils/png-data-uri.ts`: `MAX_PNG_DATA_URI_LENGTH`, `isPngDataUri(value)`, `pngDataUriToBytes(value)`, `pngDataUriByteLength(value: string): number` (for a value that passed `isPngDataUri`).
- Produces, from `lib/utils/team-mark.ts`:
  - `TEAM_NAME_MAX`, the four `TEAM_*_MESSAGE` constants, `EXPORT_MARK_HEIGHT`, `EXPORT_MARK_MAX_WIDTH`;
  - `TeamProfileInput { name: string; logo: LogoImage | null; primaryColor: string | null; secondaryColor: string | null }`, `TeamProfileField = keyof TeamProfileInput`;
  - `cleanTeamName(name: string): string`, `isTeamColor(value: string): boolean`, `isLogoImage(value: unknown): value is LogoImage`;
  - `teamProfileErrors(input: TeamProfileInput): Partial<Record<TeamProfileField, string>>`, `teamProfileError(input): string | null`;
  - `toTeamProfile(input: TeamProfileInput): TeamProfile`, `readTeamProfile(raw: unknown): TeamProfile | null`, `toTeamMark(profile: TeamProfile, id: string): TeamMark`;
  - `teamLogoAlt(name: string): string`, `exportMarkSize(image: { width: number; height: number }): { width: number; height: number }`.
- Produces, from `lib/utils/canvas/crest-png.ts`: `CREST_EXPORT_PX`, `CREST_FONT_RATIO`, `CrestPaint { name: string; color: string; size: number }`, `crestInk(color: string): string`, `paintCrest(ctx: CanvasRenderingContext2D, paint: CrestPaint): void`, `crestPng(paint: CrestPaint): string | null`.

- [ ] **Step 1: Write the failing logo-rules tests**

Create `__tests__/lib/media/logo-rules.test.ts`:

```ts
/** Logo rules shared by the hosted upload, the hosted export logo and the static upload (practice logo spec R1, R2, R4). */
import { describe, expect, it } from "vitest";
import {
    LOGO_ACCEPT,
    LOGO_CONTENT_TYPES,
    LOGO_IMAGE_FALLBACK_PX,
    LOGO_IMAGE_MAX_PX,
    LOGO_MAX_BYTES,
    MAX_LOGO_PNG_BYTES,
    fitWithin,
    sniffLogoType,
} from "@/lib/media/logo-rules";
import { LOGO_CONTENT_TYPES as BLOB_LOGO_CONTENT_TYPES, LOGO_MAX_BYTES as BLOB_LOGO_MAX_BYTES } from "@/lib/media/blob";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("logo limits", () => {
    it("keeps the hosted upload limits and shares them with blob.ts", () => {
        expect(LOGO_MAX_BYTES).toBe(2 * 1024 * 1024);
        expect([...LOGO_CONTENT_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
        expect(BLOB_LOGO_MAX_BYTES).toBe(LOGO_MAX_BYTES);
        expect(BLOB_LOGO_CONTENT_TYPES).toBe(LOGO_CONTENT_TYPES);
        expect(LOGO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
        expect([LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX, MAX_LOGO_PNG_BYTES]).toEqual([512, 256, 204800]);
    });
});

describe("sniffLogoType", () => {
    it("recognizes PNG, JPEG and WebP by their first bytes", () => {
        expect(sniffLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
        expect(sniffLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
        expect(sniffLogoType(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]))).toBe("image/webp");
    });

    it("refuses SVG, GIF, a RIFF that isn't WebP, empty and truncated input", () => {
        expect(sniffLogoType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
        expect(sniffLogoType(ascii("GIF89a"))).toBeNull();
        expect(sniffLogoType(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")]))).toBeNull();
        expect(sniffLogoType(new Uint8Array())).toBeNull();
        expect(sniffLogoType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    });
});

describe("fitWithin", () => {
    it("keeps the aspect ratio and never upscales", () => {
        expect(fitWithin(1024, 256, 512)).toEqual({ width: 512, height: 128 });
        expect(fitWithin(1200, 200, 512)).toEqual({ width: 512, height: 85 });
        expect(fitWithin(100, 800, 512)).toEqual({ width: 64, height: 512 });
        expect(fitWithin(100, 50, 512)).toEqual({ width: 100, height: 50 });
    });

    it("keeps at least one pixel on each side, and refuses an empty image", () => {
        expect(fitWithin(5000, 1, 512)).toEqual({ width: 512, height: 1 });
        expect(() => fitWithin(0, 10, 512)).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Write the failing team-mark tests**

Create `__tests__/lib/utils/team-mark.test.ts`:

```ts
/** The team mark vocabulary: profile validation, lenient reads, alt text and export size (practice logo spec R2, R4, R5). */
import { describe, expect, it } from "vitest";
import {
    EXPORT_MARK_HEIGHT,
    EXPORT_MARK_MAX_WIDTH,
    TEAM_COLOR_MESSAGE,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_NAME_LENGTH_MESSAGE,
    TEAM_NAME_REQUIRED_MESSAGE,
    cleanTeamName,
    exportMarkSize,
    isLogoImage,
    readTeamProfile,
    teamLogoAlt,
    teamProfileError,
    teamProfileErrors,
    toTeamMark,
    toTeamProfile,
    type TeamProfileInput,
} from "@/lib/utils/team-mark";
import { pngDataUriByteLength } from "@/lib/utils/png-data-uri";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
/** 204,801 decoded bytes: one over the cap. */
const BIG_PNG = `data:image/png;base64,${"A".repeat(273_068)}`;

const input = (overrides: Partial<TeamProfileInput> = {}): TeamProfileInput => ({
    name: "Ice Hawks",
    logo: null,
    primaryColor: null,
    secondaryColor: null,
    ...overrides,
});

describe("isLogoImage", () => {
    it("accepts a PNG data URL with sides 1 to 512 and at most 200 KB", () => {
        expect(isLogoImage(LOGO)).toBe(true);
        expect(isLogoImage({ ...LOGO, width: 512, height: 512 })).toBe(true);
    });

    it("refuses another type, a bad side, an oversize PNG and a non-object", () => {
        expect(pngDataUriByteLength(BIG_PNG)).toBe(204_801);
        expect(isLogoImage({ ...LOGO, dataUrl: "data:image/jpeg;base64,AAAA" })).toBe(false);
        expect(isLogoImage({ ...LOGO, dataUrl: "https://example.com/logo.png" })).toBe(false);
        expect(isLogoImage({ ...LOGO, width: 513 })).toBe(false);
        expect(isLogoImage({ ...LOGO, height: 0 })).toBe(false);
        expect(isLogoImage({ ...LOGO, width: 1.5 })).toBe(false);
        expect(isLogoImage({ dataUrl: BIG_PNG, width: 1, height: 1 })).toBe(false);
        expect(isLogoImage(null)).toBe(false);
        expect(isLogoImage(PNG)).toBe(false);
    });
});

describe("teamProfileErrors", () => {
    it("cleans the name like a staff name and accepts 1 to 60 characters", () => {
        expect(cleanTeamName("  Ice\u0007   Hawks​ ")).toBe("Ice Hawks");
        expect(teamProfileError(input({ name: "x".repeat(60) }))).toBeNull();
        expect(teamProfileError(input({ logo: LOGO, primaryColor: "#0d47a1", secondaryColor: "#FFFFFF" }))).toBeNull();
    });

    it("names each field's problem", () => {
        expect(teamProfileErrors(input({ name: " \u0007 " }))).toEqual({ name: TEAM_NAME_REQUIRED_MESSAGE });
        expect(teamProfileErrors(input({ name: "x".repeat(61) }))).toEqual({ name: TEAM_NAME_LENGTH_MESSAGE });
        expect(teamProfileErrors(input({ primaryColor: "#123", secondaryColor: "red" }))).toEqual({
            primaryColor: TEAM_COLOR_MESSAGE,
            secondaryColor: TEAM_COLOR_MESSAGE,
        });
        expect(teamProfileErrors(input({ logo: { ...LOGO, width: 600 } }))).toEqual({ logo: TEAM_LOGO_INVALID_MESSAGE });
        expect(teamProfileError(input({ name: "", primaryColor: "red" }))).toBe(TEAM_NAME_REQUIRED_MESSAGE);
    });
});

describe("toTeamProfile and readTeamProfile", () => {
    it("stores the cleaned name and uppercase colors", () => {
        expect(toTeamProfile(input({ name: " Ice  Hawks ", logo: LOGO, primaryColor: "#9b1b30" }))).toEqual({
            name: "Ice Hawks",
            logo: LOGO,
            primaryColor: "#9B1B30",
            secondaryColor: null,
        });
    });

    it("reads a stored record leniently: a bad name is no profile, a bad logo or color reads as null", () => {
        expect(readTeamProfile(undefined)).toBeNull();
        expect(readTeamProfile(null)).toBeNull();
        expect(readTeamProfile({ name: "" })).toBeNull();
        expect(readTeamProfile({ name: "Ice Hawks", logo: { dataUrl: "javascript:alert(1)", width: 1, height: 1 }, primaryColor: "red", secondaryColor: "#00695C" })).toEqual({
            name: "Ice Hawks",
            logo: null,
            primaryColor: null,
            secondaryColor: "#00695C",
        });
    });
});

describe("toTeamMark, teamLogoAlt and exportMarkSize", () => {
    it("turns a profile into the mark the shared components draw", () => {
        expect(toTeamMark({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null }, "local")).toEqual({
            id: "local",
            name: "Ice Hawks",
            logoUrl: PNG,
            color: "#9B1B30",
            logoImage: LOGO,
        });
        expect(toTeamMark({ name: "Ice Hawks", logo: null, primaryColor: null, secondaryColor: null }, "local").logoUrl).toBeNull();
    });

    it("labels the image with the team name", () => {
        expect(teamLogoAlt(`Hawks <U12> & "Co"`)).toBe(`Hawks <U12> & "Co" logo`);
    });

    it("draws an export mark 48 px high, at most 144 px wide, keeping the ratio", () => {
        expect([EXPORT_MARK_HEIGHT, EXPORT_MARK_MAX_WIDTH]).toEqual([48, 144]);
        expect(exportMarkSize({ width: 512, height: 512 })).toEqual({ width: 48, height: 48 });
        expect(exportMarkSize({ width: 512, height: 256 })).toEqual({ width: 96, height: 48 });
        expect(exportMarkSize({ width: 512, height: 85 })).toEqual({ width: 144, height: 24 });
        expect(exportMarkSize({ width: 64, height: 512 })).toEqual({ width: 6, height: 48 });
    });
});
```

- [ ] **Step 3: Write the failing Crest painter tests**

Create `__tests__/lib/utils/canvas/crest-png.test.ts`. It uses the repository's canvas mocking pattern: `vitest.setup.ts`'s 2d context, wrapped in a recording proxy (as `__tests__/lib/utils/canvas/legend-swatch.test.ts` and `export/export-images.test.ts` do):

```ts
/** crestPng: the Crest as a PNG for print and exports, with the on-screen Crest's initials, color and ink (practice logo spec R3). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREST_EXPORT_PX, CREST_FONT_RATIO, crestInk, crestPng, paintCrest } from "@/lib/utils/canvas/crest-png";

let fillStyles: string[] = [];

/** vitest.setup.ts's 2d context mock, recording every fillStyle and adding any method it lacks as a vi.fn. */
function recordingContext() {
    fillStyles = [];
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
        set(t, key, value) {
            if (key === "fillStyle") fillStyles.push(String(value));
            t[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("paintCrest", () => {
    it("fills a circle in the team color and centers the initials in white on a dark color", () => {
        const ctx = recordingContext();
        paintCrest(ctx, { name: "18U Ice Hawks", color: "#0D47A1", size: 192 });
        expect(ctx.arc).toHaveBeenCalledWith(96, 96, 96, 0, Math.PI * 2);
        expect(fillStyles).toEqual(["#0D47A1", "#fff"]);
        expect(ctx.fillText).toHaveBeenCalledWith("IH", 96, 96);
        expect(ctx.font).toMatch(new RegExp(`^800 ${Math.round(192 * CREST_FONT_RATIO)}px 'Cabinet Grotesk'`));
        expect([ctx.textAlign, ctx.textBaseline]).toEqual(["center", "middle"]);
    });

    it("uses dark ink on a light brand color, as the on-screen Crest does", () => {
        expect(crestInk("#FFEB3B")).toBe("#000");
        expect(crestInk("#9B1B30")).toBe("#fff");
    });
});

describe("crestPng", () => {
    it("draws on a size × size canvas and returns its PNG", () => {
        const ctx = recordingContext();
        let drawnOn: HTMLCanvasElement | undefined;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
            drawnOn = this;
            return ctx;
        } as never);
        expect(crestPng({ name: "Storm", color: "#00695C", size: CREST_EXPORT_PX })).toBe("data:image/png;base64,mockImageData"); // vitest.setup.ts's toDataURL
        expect([drawnOn?.width, drawnOn?.height]).toEqual([192, 192]);
        expect(ctx.fillText).toHaveBeenCalledWith("ST", 96, 96);
    });

    it("returns null without a 2d context", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        expect(crestPng({ name: "Storm", color: "#00695C", size: 48 })).toBeNull();
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/media/logo-rules.test.ts __tests__/lib/utils/team-mark.test.ts __tests__/lib/utils/canvas/crest-png.test.ts`
Expected: FAIL with "Failed to resolve import" for `@/lib/media/logo-rules`, `@/lib/utils/team-mark` and `@/lib/utils/canvas/crest-png`.

- [ ] **Step 5: Add the types**

In `types/practice-planner.ts`, after the `StaffOption` interface, add:

```ts
/**
 * A logo ready for a bench sheet or an export (practice logo spec R2): a PNG
 * data URL that fits 512×512 and is at most 200 KB (isLogoImage).
 */
export interface LogoImage {
    dataUrl: string;
    width: number;
    height: number;
}

/**
 * The team identity a practice shows (spec R5). Hosted: the team. Static: the
 * device's "Your team" profile. `id` seeds the Crest's fallback color.
 */
export interface TeamMark {
    id: string;
    name: string;
    /** What the on-screen Crest draws: a hosted blob URL, or the static profile's PNG data URL. */
    logoUrl: string | null;
    /** The owner's brand color; null = the Crest's derived color. */
    color: string | null;
    /** Export-ready logo when the platform already holds one (static). Absent: hosted fetches it (getPracticeLogoImage). */
    logoImage?: LogoImage | null;
}

/** The static planner's device-wide "Your team" (spec R4). Plan files never carry it. */
export interface TeamProfile {
    name: string;
    logo: LogoImage | null;
    primaryColor: string | null;
    secondaryColor: string | null;
}
```

In `PracticeSessionView`, after `teamName: string;`, add:

```ts
    /** The team's mark (spec R5); absent or null shows none. */
    teamMark?: TeamMark | null;
```

- [ ] **Step 6: Create the logo rules and point blob.ts at them**

Create `lib/media/logo-rules.ts`:

```ts
/**
 * Crest logo rules shared by the hosted upload route, the hosted export logo
 * (lib/media/logo-image.ts) and the static planner's "Your team" upload.
 * Pure and portable: no Node, Next.js or storage import, so the static
 * planner can load it (blob.ts imports @vercel/blob and can't be).
 */

/**
 * Crest logos. Kept well under the gallery's image cap: these render at 104px
 * at the very largest, so a multi-megabyte upload is pure waste on every page
 * that shows the crest.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** SVG is deliberately absent — it is a script-execution vector. */
export const LOGO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** For a file input's accept attribute. */
export const LOGO_ACCEPT = LOGO_CONTENT_TYPES.join(",");

/** A bench sheet or export logo fits this square (spec R2)… */
export const LOGO_IMAGE_MAX_PX = 512;
/** …and is encoded again within this one when its PNG is too large. */
export const LOGO_IMAGE_FALLBACK_PX = 256;
/** The largest normalized logo PNG, decoded bytes (spec R4). */
export const MAX_LOGO_PNG_BYTES = 200 * 1024;

function startsWith(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
    if (bytes.length < offset + expected.length) return false;
    return expected.every((value, index) => bytes[offset + index] === value);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The logo type from the file's first bytes: never from a name, an extension or a content-type header. */
export function sniffLogoType(bytes: Uint8Array): LogoContentType | null {
    if (startsWith(bytes, 0, PNG)) return "image/png";
    if (startsWith(bytes, 0, JPEG)) return "image/jpeg";
    if (startsWith(bytes, 0, RIFF) && startsWith(bytes, 8, WEBP)) return "image/webp";
    return null;
}

/** The size that fits within max × max, keeping the ratio, never upscaling, at least 1 px a side. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
    if (!(width > 0 && height > 0)) throw new RangeError("An image needs a positive width and height");
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
```

In `lib/media/blob.ts`, delete the `LOGO_MAX_BYTES` and `LOGO_CONTENT_TYPES` blocks (with their comments) and add, under the imports:

```ts
/** Crest logo limits live in the portable logo-rules module; re-exported for the upload route. */
export { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from "./logo-rules";
```

- [ ] **Step 7: Move the PNG helpers to lib/utils**

Create `lib/utils/png-data-uri.ts` with the body of `components/features/practice-planner/export/png.ts` (its doc comment, `PNG_DATA_URI`, `MAX_PNG_DATA_URI_LENGTH`, `isPngDataUri`, `pngDataUriToBytes`), unchanged, plus:

```ts
/** Decoded bytes of a URI that passed isPngDataUri, without decoding it. */
export function pngDataUriByteLength(value: string): number {
    const payload = value.slice(value.indexOf(",") + 1);
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return (payload.length / 4) * 3 - padding;
}
```

Replace the whole of `components/features/practice-planner/export/png.ts` with:

```ts
/** PNG data URIs: the only image source the document exports embed. The helpers live in lib/utils (the logo rules use them too). */
export { MAX_PNG_DATA_URI_LENGTH, isPngDataUri, pngDataUriToBytes } from "@/lib/utils/png-data-uri";
```

- [ ] **Step 8: Create the team-mark module**

Create `lib/utils/team-mark.ts`:

```ts
/**
 * The team mark (practice logo spec R2, R4, R5): the static "Your team"
 * profile's rules, and the helpers both planners use to draw a team's logo or
 * Crest. Pure and portable.
 */
import { LOGO_IMAGE_MAX_PX, MAX_LOGO_PNG_BYTES } from "@/lib/media/logo-rules";
import { isPngDataUri, pngDataUriByteLength } from "@/lib/utils/png-data-uri";
import { cleanStaffName } from "@/lib/utils/session-staff";
import type { LogoImage, TeamMark, TeamProfile } from "@/types/practice-planner";

export const TEAM_NAME_MAX = 60;
export const TEAM_NAME_REQUIRED_MESSAGE = "Team name is required";
export const TEAM_NAME_LENGTH_MESSAGE = `Team name must be at most ${TEAM_NAME_MAX} characters`;
/** Hosted branding's text (lib/actions/branding.ts). */
export const TEAM_COLOR_MESSAGE = "Use a hex color like #0D47A1";
export const TEAM_LOGO_INVALID_MESSAGE = "The logo must be a PNG of at most 512 × 512 pixels and 200 KB";

/** An export draws the mark this high (spec R2)… */
export const EXPORT_MARK_HEIGHT = 48;
/** …and no wider than this (a wide wordmark is scaled down to fit). */
export const EXPORT_MARK_MAX_WIDTH = 144;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

export interface TeamProfileInput {
    name: string;
    logo: LogoImage | null;
    primaryColor: string | null;
    secondaryColor: string | null;
}

export type TeamProfileField = keyof TeamProfileInput;

/** The same cleaning as a staff name (spec R4): control and invisible characters removed, whitespace collapsed, trimmed. */
export function cleanTeamName(name: string): string {
    return cleanStaffName(name);
}

/** `#RRGGBB` only: the static color fields write six digits. */
export function isTeamColor(value: string): boolean {
    return HEX6.test(value);
}

function isSide(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= LOGO_IMAGE_MAX_PX;
}

/** A normalized logo (spec R2): a PNG data URL, sides 1–512, at most 200 KB decoded. */
export function isLogoImage(value: unknown): value is LogoImage {
    if (typeof value !== "object" || value === null) return false;
    const { dataUrl, width, height } = value as Record<string, unknown>;
    return (
        typeof dataUrl === "string" &&
        isPngDataUri(dataUrl) &&
        pngDataUriByteLength(dataUrl) <= MAX_LOGO_PNG_BYTES &&
        isSide(width) &&
        isSide(height)
    );
}

export function teamProfileErrors(input: TeamProfileInput): Partial<Record<TeamProfileField, string>> {
    const errors: Partial<Record<TeamProfileField, string>> = {};
    const name = cleanTeamName(typeof input.name === "string" ? input.name : "");
    if (!name) errors.name = TEAM_NAME_REQUIRED_MESSAGE;
    else if (name.length > TEAM_NAME_MAX) errors.name = TEAM_NAME_LENGTH_MESSAGE;
    if (input.logo !== null && !isLogoImage(input.logo)) errors.logo = TEAM_LOGO_INVALID_MESSAGE;
    for (const field of ["primaryColor", "secondaryColor"] as const) {
        const value: unknown = input[field];
        if (value !== null && (typeof value !== "string" || !isTeamColor(value))) errors[field] = TEAM_COLOR_MESSAGE;
    }
    return errors;
}

/** The first problem, in field order, or null. */
export function teamProfileError(input: TeamProfileInput): string | null {
    const errors = teamProfileErrors(input);
    return errors.name ?? errors.logo ?? errors.primaryColor ?? errors.secondaryColor ?? null;
}

/** What the store keeps, for an input teamProfileError accepted. */
export function toTeamProfile(input: TeamProfileInput): TeamProfile {
    return {
        name: cleanTeamName(input.name),
        logo: input.logo ? { dataUrl: input.logo.dataUrl, width: input.logo.width, height: input.logo.height } : null,
        primaryColor: input.primaryColor ? input.primaryColor.toUpperCase() : null,
        secondaryColor: input.secondaryColor ? input.secondaryColor.toUpperCase() : null,
    };
}

/** A stored record, read leniently: a bad name is no profile; a bad logo or color reads as null. */
export function readTeamProfile(raw: unknown): TeamProfile | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? cleanTeamName(record.name) : "";
    if (!name || name.length > TEAM_NAME_MAX) return null;
    const color = (value: unknown) => (typeof value === "string" && isTeamColor(value) ? value.toUpperCase() : null);
    return {
        name,
        logo: isLogoImage(record.logo) ? { dataUrl: record.logo.dataUrl, width: record.logo.width, height: record.logo.height } : null,
        primaryColor: color(record.primaryColor),
        secondaryColor: color(record.secondaryColor),
    };
}

/** The mark a profile draws. `id` seeds the Crest's fallback color (the static planner passes LOCAL_TEAM_ID). */
export function toTeamMark(profile: TeamProfile, id: string): TeamMark {
    return { id, name: profile.name, logoUrl: profile.logo?.dataUrl ?? null, color: profile.primaryColor, logoImage: profile.logo };
}

/** The mark image's alt text (spec R5). Callers escape it for their format. */
export function teamLogoAlt(name: string): string {
    return `${name.trim()} logo`;
}

/** The size an export draws a logo at: 48 px high, at most 144 px wide, ratio kept. */
export function exportMarkSize(image: { width: number; height: number }): { width: number; height: number } {
    const width = Math.round((EXPORT_MARK_HEIGHT * image.width) / image.height);
    if (width <= EXPORT_MARK_MAX_WIDTH) return { width: Math.max(1, width), height: EXPORT_MARK_HEIGHT };
    return { width: EXPORT_MARK_MAX_WIDTH, height: Math.max(1, Math.round((EXPORT_MARK_MAX_WIDTH * image.height) / image.width)) };
}
```

- [ ] **Step 9: Create the Crest painter**

Create `lib/utils/canvas/crest-png.ts`:

```ts
/**
 * The Crest as a PNG (practice logo spec R3): what the printed bench sheet and
 * the HTML and Word exports show when a team has no logo. Same initials
 * (crestInitials), color (the caller passes resolveCrestColor's result), ink
 * (contrastTextFor) and font as components/ui/Crest.tsx, in a filled circle.
 * A canvas drawing is used for print because browsers drop CSS backgrounds
 * when printing, and documents need an image anyway.
 */
import theme from "@/lib/theme";
import { contrastTextFor } from "@/lib/utils/contrast-color";
import { crestInitials } from "@/lib/utils/crest";

/** Crest md's monogram: 17 px on a 48 px circle (components/ui/Crest.tsx). */
export const CREST_FONT_RATIO = 17 / 48;
/** Exports draw the Crest at 48 px; 4× keeps it sharp in print and in Word. */
export const CREST_EXPORT_PX = 192;

const FONT_FAMILY = String(theme.typography.fontFamily);

export interface CrestPaint {
    name: string;
    /** A resolved hex color (resolveCrestColor). */
    color: string;
    /** Canvas pixels, square. */
    size: number;
}

/** White or black, whichever reads on the color: the on-screen Crest's rule. */
export function crestInk(color: string): string {
    return contrastTextFor(theme, color, theme.palette.common.white);
}

export function paintCrest(ctx: CanvasRenderingContext2D, { name, color, size }: CrestPaint): void {
    const radius = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = crestInk(color);
    ctx.font = `800 ${Math.round(size * CREST_FONT_RATIO)}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(crestInitials(name), radius, radius);
}

/** A PNG data URL of the Crest, or null when the browser gives no 2d context. */
export function crestPng(paint: CrestPaint): string | null {
    const canvas = document.createElement("canvas");
    canvas.width = paint.size;
    canvas.height = paint.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintCrest(ctx, paint);
    return canvas.toDataURL("image/png");
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/media __tests__/lib/utils/team-mark.test.ts __tests__/lib/utils/canvas/crest-png.test.ts __tests__/components/features/practice-planner/export`
Expected: PASS (the existing `png.test.ts` passes through the re-export).

If `crestInk("#FFEB3B")` returns something other than `"#000"`, read `theme.palette.common.black` in `lib/theme.ts` and use that value in the test. The test pins the theme's own literals, not a guess.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/media/logo-rules.ts lib/media/blob.ts lib/utils/png-data-uri.ts \
  components/features/practice-planner/export/png.ts lib/utils/team-mark.ts lib/utils/canvas/crest-png.ts \
  __tests__/lib/media/logo-rules.test.ts __tests__/lib/utils/team-mark.test.ts __tests__/lib/utils/canvas/crest-png.test.ts
/usr/bin/git commit -m "feat(practice-planner): team mark types, logo rules and the crest painter" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Hosted export logo: the server action, image normalization and the detail read

**Files:**
- Modify: `package.json`, `bun.lock` (`sharp` promoted to a direct dependency)
- Create: `lib/utils/practice-access.ts`
- Create: `lib/media/logo-image.ts`
- Create: `lib/actions/practice-logo.ts`
- Modify: `lib/actions/practice-session-queries.ts` (`getPracticeSessionDetail`: access check, team select, `teamMark`)
- Modify: `lib/planner-store/types.ts` (`PlannerStore.getPracticeLogoImage?`)
- Modify: `components/providers/HostedPlannerProvider.tsx`
- Modify: `__tests__/helpers/planner.tsx` (`createMockPlannerStore` gains `getPracticeLogoImage`)
- Modify: `__tests__/helpers/action-id-sweep-table.ts` (new entry)
- Test (create): `__tests__/lib/utils/practice-access.test.ts`, `__tests__/lib/media/logo-image.test.ts`, `__tests__/lib/actions/practice-logo.test.ts`
- Test (append): `__tests__/lib/actions/practice-session-queries.test.ts`, `__tests__/lib/actions/action-id-arguments-readers.test.ts`
- Test (breaks, fix here): `__tests__/components/providers/HostedPlannerProvider.test.tsx`. It would import the real action module, so mock it and add the row.

**Interfaces:**
- Consumes: `LogoImage`, `TeamMark` (Task 1); `sniffLogoType`, `LOGO_MAX_BYTES`, `LOGO_IMAGE_MAX_PX`, `LOGO_IMAGE_FALLBACK_PX`, `MAX_LOGO_PNG_BYTES` (Task 1); `isLogoImage` (tests).
- Produces:
  - `canViewPracticeSession(role: string | null | undefined, isShared: boolean): boolean`;
  - `LOGO_FETCH_TIMEOUT_MS`, `LOGO_INPUT_PIXEL_LIMIT`;
  - `fetchLogoBytes(url: string, options?: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch }): Promise<Uint8Array | null>` (throws on network errors and timeouts);
  - `normalizeLogoBytes(bytes: Uint8Array, options?: { maxPngBytes?: number; maxInputPixels?: number }): Promise<LogoImage | null>` (throws when sharp can't decode);
  - `getPracticeLogoImage(sessionId: string): Promise<LogoImage | null>`;
  - `PlannerStore.getPracticeLogoImage?: (sessionId: string) => Promise<LogoImage | null>`;
  - `getPracticeSessionDetail(...)` now returns `session.teamMark: TeamMark`.

- [ ] **Step 1: Promote sharp**

Run: `bun add sharp@^0.35.4`
Then: `/usr/bin/git diff --stat package.json bun.lock && /usr/bin/git diff bun.lock | head -40`
Expected: `package.json` gains `"sharp": "^0.35.4"` under `dependencies`. `bun.lock` changes only the root workspace's dependency list: no new package entries, and `sharp@0.35.4` resolves as before. If any other package's version changes, run `/usr/bin/git checkout -- package.json bun.lock` and add only the `"sharp": "^0.35.4"` line by hand, then `bun install`.

- [ ] **Step 2: Write the failing access and normalization tests**

Create `__tests__/lib/utils/practice-access.test.ts`:

```ts
/** Who may read a practice: the detail page, the bench sheet and the export logo share this rule. */
import { describe, expect, it } from "vitest";
import { canViewPracticeSession } from "@/lib/utils/practice-access";

describe("canViewPracticeSession", () => {
    it.each([
        ["ADMIN", false, true],
        ["ADMIN", true, true],
        ["MEMBER", true, true],
        ["MEMBER", false, false],
        [null, true, false],
        [undefined, true, false],
    ] as const)("role %s, shared %s → %s", (role, isShared, expected) => {
        expect(canViewPracticeSession(role, isShared)).toBe(expected);
    });
});
```

Create `__tests__/lib/media/logo-image.test.ts`. It runs in the node environment, because sharp is a native module and expects Node's `Buffer`, and builds real images with sharp:

```ts
// @vitest-environment node
/** Server-side logo fetch and normalization (practice logo spec R1, R2). Real images, built with sharp. */
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_FETCH_TIMEOUT_MS, LOGO_INPUT_PIXEL_LIMIT, fetchLogoBytes, normalizeLogoBytes } from "@/lib/media/logo-image";
import { isLogoImage } from "@/lib/utils/team-mark";

const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r: 13, g: 71, b: 161, alpha: 1 } } });
const png = async (width: number, height: number) => new Uint8Array(await solid(width, height).png().toBuffer());

/** Deterministic noise: compresses badly, so its PNG size depends on its pixel count. */
async function noisePng(side: number): Promise<Uint8Array> {
    const raw = Buffer.alloc(side * side * 3);
    let seed = 12345;
    for (let i = 0; i < raw.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed & 0xff;
    }
    return new Uint8Array(await sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png().toBuffer());
}

function decodeSize(dataUrl: string) {
    return sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
}

describe("normalizeLogoBytes", () => {
    it("fits a wide PNG within 512, keeps the ratio and returns a valid logo", async () => {
        const logo = await normalizeLogoBytes(await png(1024, 256));
        expect(logo).toMatchObject({ width: 512, height: 128 });
        expect(isLogoImage(logo)).toBe(true);
        const meta = await decodeSize(logo!.dataUrl);
        expect([meta.format, meta.width, meta.height]).toEqual(["png", 512, 128]);
    });

    it("keeps a wordmark's shape and never upscales a small logo", async () => {
        expect(await normalizeLogoBytes(await png(1200, 200))).toMatchObject({ width: 512, height: 85 });
        expect(await normalizeLogoBytes(await png(100, 50))).toMatchObject({ width: 100, height: 50 });
    });

    it("accepts JPEG and WebP and returns PNG", async () => {
        const jpeg = new Uint8Array(await solid(640, 640).jpeg().toBuffer());
        const webp = new Uint8Array(await solid(300, 600).webp().toBuffer());
        expect(await normalizeLogoBytes(jpeg)).toMatchObject({ width: 512, height: 512 });
        expect(await normalizeLogoBytes(webp)).toMatchObject({ width: 256, height: 512 });
        expect((await normalizeLogoBytes(webp))!.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("refuses SVG and GIF by their bytes, before decoding", async () => {
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
        const gif = new Uint8Array(await solid(10, 10).gif().toBuffer());
        expect(await normalizeLogoBytes(svg)).toBeNull();
        expect(await normalizeLogoBytes(gif)).toBeNull();
    });

    it("encodes again within 256 when the 512 PNG is too large, and refuses when that is too", async () => {
        const source = await noisePng(600);
        const at512 = (await normalizeLogoBytes(source, { maxPngBytes: Number.MAX_SAFE_INTEGER }))!;
        const bytes512 = Buffer.from(at512.dataUrl.split(",")[1], "base64").byteLength;
        const smaller = await normalizeLogoBytes(source, { maxPngBytes: bytes512 - 1 });
        expect(smaller).toMatchObject({ width: 256, height: 256 });
        expect(await normalizeLogoBytes(source, { maxPngBytes: 1000 })).toBeNull();
    });

    it("rejects a corrupt image and an image over the pixel limit (the caller turns both into null)", async () => {
        const truncated = (await png(64, 64)).slice(0, 40);
        await expect(normalizeLogoBytes(truncated)).rejects.toThrow();
        await expect(normalizeLogoBytes(await png(20, 20), { maxInputPixels: 100 })).rejects.toThrow();
        expect(LOGO_INPUT_PIXEL_LIMIT).toBe(40_000_000);
    });
});

describe("fetchLogoBytes", () => {
    const URL_ = "https://abc.public.blob.vercel-storage.com/branding/team/t1/logo.png";

    it("asks for no redirects, no cache and a 5 s timeout, and returns the body", async () => {
        const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
        expect(await fetchLogoBytes(URL_, { fetchImpl })).toEqual(new Uint8Array([1, 2, 3]));
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect([init.redirect, init.cache, init.signal instanceof AbortSignal]).toEqual(["error", "no-store", true]);
        expect(LOGO_FETCH_TIMEOUT_MS).toBe(5000);
    });

    it("returns null for a failed response and for a declared size over the cap", async () => {
        expect(await fetchLogoBytes(URL_, { fetchImpl: async () => new Response("gone", { status: 404 }) })).toBeNull();
        const declared = new Response(new Uint8Array(10), { headers: { "content-length": "11" } });
        expect(await fetchLogoBytes(URL_, { maxBytes: 10, fetchImpl: async () => declared })).toBeNull();
    });

    it("stops reading once the streamed body passes the cap", async () => {
        let pulls = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulls += 1;
                controller.enqueue(new Uint8Array(6));
            },
        });
        expect(await fetchLogoBytes(URL_, { maxBytes: 10, fetchImpl: async () => new Response(body) })).toBeNull();
        expect(pulls).toBeLessThan(5);
    });

    it("rejects when the timeout passes", async () => {
        const fetchImpl = (_url: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
        await expect(fetchLogoBytes(URL_, { timeoutMs: 20, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow();
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/practice-access.test.ts __tests__/lib/media/logo-image.test.ts`
Expected: FAIL with "Failed to resolve import" for `@/lib/utils/practice-access` and `@/lib/media/logo-image`.

- [ ] **Step 4: Implement the access rule and the normalization**

Create `lib/utils/practice-access.ts`:

```ts
/**
 * Who may read a practice: its team's admins always, its members once it's
 * shared. The session detail read (page and bench sheet) and the export logo
 * action share this rule, so the logo is never readable by anyone the
 * practice isn't.
 */
export function canViewPracticeSession(role: string | null | undefined, isShared: boolean): boolean {
    if (!role) return false;
    return role === "ADMIN" || isShared;
}
```

Create `lib/media/logo-image.ts`:

```ts
/**
 * The team logo for bench sheet exports, server side (practice logo spec R1,
 * R2). Server only: sharp is a native module (a Next.js server external
 * package), loaded on first use so nothing else pays for it.
 */
import { LOGO_IMAGE_FALLBACK_PX, LOGO_IMAGE_MAX_PX, LOGO_MAX_BYTES, MAX_LOGO_PNG_BYTES, sniffLogoType } from "./logo-rules";
import type { LogoImage } from "@/types/practice-planner";

export const LOGO_FETCH_TIMEOUT_MS = 5_000;
/** Decoded pixels allowed in: a 2 MB file can declare enormous dimensions. */
export const LOGO_INPUT_PIXEL_LIMIT = 40_000_000;

const DECODABLE_FORMATS = new Set(["png", "jpeg", "webp"]);

export interface FetchLogoOptions {
    timeoutMs?: number;
    maxBytes?: number;
    fetchImpl?: typeof fetch;
}

/**
 * The logo's bytes, or null when the response fails or is larger than the cap
 * (declared or streamed). No redirects: an owned blob URL never redirects.
 * Network errors and the timeout reject; the caller turns them into null.
 */
export async function fetchLogoBytes(
    url: string,
    { timeoutMs = LOGO_FETCH_TIMEOUT_MS, maxBytes = LOGO_MAX_BYTES, fetchImpl = fetch }: FetchLogoOptions = {},
): Promise<Uint8Array | null> {
    const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        return null;
    }
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body.cancel();
        return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export interface NormalizeLogoOptions {
    maxPngBytes?: number;
    maxInputPixels?: number;
}

/**
 * A PNG within 512×512 (within 256 when the 512 PNG is over the cap), or null
 * for a type other than PNG, JPEG or WebP, or a logo too large either way.
 * Types come from the bytes (sniffLogoType), then from sharp's own reading.
 * A corrupt image or one over the pixel limit rejects.
 */
export async function normalizeLogoBytes(
    bytes: Uint8Array,
    { maxPngBytes = MAX_LOGO_PNG_BYTES, maxInputPixels = LOGO_INPUT_PIXEL_LIMIT }: NormalizeLogoOptions = {},
): Promise<LogoImage | null> {
    if (!sniffLogoType(bytes)) return null;
    const { default: sharp } = await import("sharp");
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const options = { failOn: "error", limitInputPixels: maxInputPixels } as const;
    const { format } = await sharp(input, options).metadata();
    if (!format || !DECODABLE_FORMATS.has(format)) return null;
    for (const side of [LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX]) {
        const { data, info } = await sharp(input, options)
            .rotate()
            .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer({ resolveWithObject: true });
        if (data.byteLength <= maxPngBytes) {
            return { dataUrl: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
        }
    }
    return null;
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `bun run test __tests__/lib/utils/practice-access.test.ts __tests__/lib/media/logo-image.test.ts`
Expected: PASS.
- If sharp rejects the `gif()` fixture, build the GIF bytes by hand instead (`new TextEncoder().encode("GIF89a")` followed by zero bytes), since only the sniff is under test.
- If the noise test's 256 output is not smaller than its 512 output, raise the source side to 800.

- [ ] **Step 6: Write the failing action tests**

Create `__tests__/lib/actions/practice-logo.test.ts`:

```ts
// @vitest-environment node
/** getPracticeLogoImage (practice logo spec R1, R6): id first, the detail read's access rule, owned blob URLs only, null on any failure. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const { mockPrisma, mockUserId } = vi.hoisted(() => ({
    mockPrisma: { practiceSession: { findUnique: vi.fn() }, teamMember: { findFirst: vi.fn() } },
    mockUserId: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserId: mockUserId }));

import { getPracticeLogoImage } from "@/lib/actions/practice-logo";
import { isLogoImage } from "@/lib/utils/team-mark";

const SESSION_ID = "clsession00000000000000001";
const TEAM_ID = "clteam000000000000000000001";
const USER_ID = "cluser000000000000000000001";
const OWNED = `https://abc.public.blob.vercel-storage.com/branding/team/${TEAM_ID}/logo-a1.png`;

let fetchMock: ReturnType<typeof vi.fn>;

async function pngBytes(width = 800, height = 400) {
    return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: "#9B1B30" } }).png().toBuffer());
}

function session(overrides: { logoUrl?: string | null; isShared?: boolean } = {}) {
    return { teamId: TEAM_ID, isShared: overrides.isShared ?? false, team: { logoUrl: overrides.logoUrl === undefined ? OWNED : overrides.logoUrl } };
}

beforeEach(async () => {
    vi.clearAllMocks();
    mockUserId.mockResolvedValue(USER_ID);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(session());
    mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "ADMIN" });
    const bytes = await pngBytes();
    fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("getPracticeLogoImage", () => {
    it("returns the team logo as a normalized PNG for an admin", async () => {
        const logo = await getPracticeLogoImage(SESSION_ID);
        expect(logo).toMatchObject({ width: 512, height: 256 });
        expect(isLogoImage(logo)).toBe(true);
        expect(JSON.stringify(logo)).not.toContain("blob.vercel-storage.com");
        expect(fetchMock).toHaveBeenCalledWith(OWNED, expect.objectContaining({ redirect: "error" }));
        expect(mockPrisma.practiceSession.findUnique).toHaveBeenCalledWith({
            where: { id: SESSION_ID },
            select: { teamId: true, isShared: true, team: { select: { logoUrl: true } } },
        });
        expect(mockPrisma.teamMember.findFirst).toHaveBeenCalledWith({ where: { userId: USER_ID, teamId: TEAM_ID }, select: { role: true } });
    });

    it("returns it to a member when the practice is shared, as the detail read does", async () => {
        mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "MEMBER" });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ isShared: true }));
        expect(await getPracticeLogoImage(SESSION_ID)).not.toBeNull();
    });

    it.each([
        ["a member of an unshared practice", () => mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "MEMBER" })],
        ["someone outside the team", () => mockPrisma.teamMember.findFirst.mockResolvedValue(null)],
        ["a missing practice", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(null)],
        ["a team without a logo", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: null }))],
        ["another team's blob", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/clother0000000000000000001/x.png" }))],
        ["a URL off our blob host", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: `https://example.com/branding/team/${TEAM_ID}/x.png` }))],
    ])("returns null without fetching for %s", async (_label, arrange) => {
        arrange();
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("checks the id before reading the user or the database", async () => {
        for (const bad of ["", "not-an-id", "x".repeat(400), { not: SESSION_ID }, null] as unknown[]) {
            expect(await getPracticeLogoImage(bad as string)).toBeNull();
        }
        expect(mockUserId).not.toHaveBeenCalled();
        expect(mockPrisma.practiceSession.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for a signed-out caller, without redirecting or querying", async () => {
        mockUserId.mockResolvedValue(null);
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(mockPrisma.practiceSession.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for a body that isn't an image, judged by its bytes, and logs it without the URL", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue(new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { "content-type": "image/png" } }));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(OWNED);
    });

    it("returns null for a body over 2 MB or a failed response, and logs each", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 }));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it("returns null on a timeout or a network error, and logs neither the URL nor an id", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        const logged = JSON.stringify(warn.mock.calls);
        expect(warn).toHaveBeenCalledTimes(2);
        for (const secret of [OWNED, SESSION_ID, TEAM_ID, USER_ID]) expect(logged).not.toContain(secret);
    });

    it("returns null for a corrupt image", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue(new Response((await pngBytes()).slice(0, 40)));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
    });
});
```

Append to `__tests__/lib/actions/practice-session-queries.test.ts`:

```ts
describe("getPracticeSessionDetail: the team mark (practice logo spec R5)", () => {
  const DETAIL = {
    id: "s1", teamId: "t1", title: "T", date: new Date("2026-04-07T22:00:00Z"), duration: 60, isShared: false,
    createdBy: { name: "Coach" }, venue: null, surface: null, segment: null, staff: [], plays: [],
    team: { id: "t1", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t1/l.png", brandPrimaryColor: "#9B1B30" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(DETAIL);
  });

  it("reads the team's logo and brand color into the mark", async () => {
    const result = await getPracticeSessionDetail(SESSION_ID);
    expect(result?.session.teamMark).toEqual({
      id: "t1", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t1/l.png", color: "#9B1B30",
    });
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.team).toEqual({
      select: { id: true, name: true, logoUrl: true, brandPrimaryColor: true },
    });
  });

  it("reads a team without branding as a mark with no logo and no color", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValueOnce({
      ...DETAIL,
      team: { id: "t1", name: "Ice Hawks", logoUrl: null, brandPrimaryColor: null },
    });
    expect((await getPracticeSessionDetail(SESSION_ID))?.session.teamMark).toEqual({ id: "t1", name: "Ice Hawks", logoUrl: null, color: null });
  });
});
```

In `__tests__/lib/actions/action-id-arguments-readers.test.ts`, add the import beside the practice-session-queries import:

```ts
import { getPracticeLogoImage } from "@/lib/actions/practice-logo";
```

and the row after the `getPracticeSessionForEdit` row:

```ts
  { name: "getPracticeLogoImage", call: (b) => getPracticeLogoImage(s(b)), outcome: { returns: null } },
```

In `__tests__/helpers/action-id-sweep-table.ts`, add after the `plays#…` entries and before the `practice-session-drills#…` entries, keeping the table's alphabetical order:

```ts
  "practice-logo#getPracticeLogoImage": [ID],
```

The action reads the practice with `where: { id }` before any membership lookup, so a well-formed id reaches a query: no `VALID_TEMPLATE_EXEMPTIONS` entry is needed.

In `__tests__/components/providers/HostedPlannerProvider.test.tsx`, add beside the other hoisted mocks:

```ts
const logo = vi.hoisted(() => ({ getPracticeLogoImage: vi.fn() }));
vi.mock("@/lib/actions/practice-logo", () => logo);
```

and the row at the end of the `it.each` table:

```ts
        ["getPracticeLogoImage", logo.getPracticeLogoImage],
```

- [ ] **Step 7: Run them to verify they fail**

Run: `bun run test __tests__/lib/actions/practice-logo.test.ts __tests__/lib/actions/practice-session-queries.test.ts __tests__/components/providers/HostedPlannerProvider.test.tsx`
Expected: FAIL. `@/lib/actions/practice-logo` doesn't resolve, `teamMark` is undefined, and `hostedPlannerStore.getPracticeLogoImage` is undefined.

- [ ] **Step 8: Implement the action, the detail read and the seam**

Create `lib/actions/practice-logo.ts`:

```ts
"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/session";
import { entityLogoPrefix, isOwnedBlobUrl } from "@/lib/media/blob";
import { fetchLogoBytes, normalizeLogoBytes } from "@/lib/media/logo-image";
import { parseId } from "@/lib/utils/ids";
import { canViewPracticeSession } from "@/lib/utils/practice-access";
import type { LogoImage } from "@/types/practice-planner";

/**
 * The team logo for a practice's bench sheet exports (practice logo spec R1):
 * a PNG data URL within 512×512, or null, and the export draws the team's
 * Crest instead. Readable by whoever can read the practice (the detail read's
 * rule). Only the team's own blob objects are fetched; the URL never leaves
 * the server. Every failure is null, and a log line names the error type only.
 */
export async function getPracticeLogoImage(sessionId: string): Promise<LogoImage | null> {
    const id = parseId(sessionId);
    if (!id) return null;
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const session = await prisma.practiceSession.findUnique({
        where: { id },
        select: { teamId: true, isShared: true, team: { select: { logoUrl: true } } },
    });
    if (!session) return null;
    const membership = await prisma.teamMember.findFirst({
        where: { userId, teamId: session.teamId },
        select: { role: true },
    });
    if (!canViewPracticeSession(membership?.role, session.isShared)) return null;

    const url = session.team.logoUrl;
    if (!url || !isOwnedBlobUrl(url, entityLogoPrefix("team", session.teamId))) return null;
    try {
        const bytes = await fetchLogoBytes(url);
        if (!bytes) {
            console.warn("Practice logo unavailable: the response failed or was over the size cap");
            return null;
        }
        const logo = await normalizeLogoBytes(bytes);
        if (!logo) console.warn("Practice logo unavailable: not a PNG, JPEG or WebP image, or too large once normalized");
        return logo;
    } catch (error) {
        console.warn("Practice logo unavailable:", error instanceof Error ? error.name : "unknown error");
        return null;
    }
}
```

In `lib/actions/practice-session-queries.ts`:
- add the imports `import { canViewPracticeSession } from "@/lib/utils/practice-access";` and add `TeamMark` to the existing `@/types/practice-planner` type import;
- in `getPracticeSessionDetail`'s return type, after `teamName: string;`, add `teamMark: TeamMark;`;
- change the include's `team: { select: { id: true, name: true } },` to `team: { select: { id: true, name: true, logoUrl: true, brandPrimaryColor: true } },`;
- replace the access block

```ts
  if (!membership) return null;

  const isAdmin = membership.role === "ADMIN";
  if (!isAdmin && !session.isShared) return null;
```

with

```ts
  if (!membership || !canViewPracticeSession(membership.role, session.isShared)) return null;
  const isAdmin = membership.role === "ADMIN";
```

- after `teamName: session.team.name,` in the returned session, add:

```ts
      teamMark: {
        id: session.team.id,
        name: session.team.name,
        logoUrl: session.team.logoUrl ?? null,
        color: session.team.brandPrimaryColor ?? null,
      },
```

In `lib/planner-store/types.ts`, add `LogoImage` to the `@/types/practice-planner` type import, and in `PlannerStore`, after `sharePracticeSession?`, add:

```ts
    /**
     * The team logo as an export-ready PNG, or null (practice logo spec R1).
     * Hosted only: the static planner's exports use the device profile's
     * stored logo (TeamMark.logoImage).
     */
    getPracticeLogoImage?: (sessionId: string) => Promise<LogoImage | null>;
```

In `components/providers/HostedPlannerProvider.tsx`, add `import { getPracticeLogoImage } from "@/lib/actions/practice-logo";` and `getPracticeLogoImage,` as the last member of `hostedPlannerStore`.

In `__tests__/helpers/planner.tsx`, add as the last member of `createMockPlannerStore()`'s object:

```ts
        getPracticeLogoImage: vi.fn().mockResolvedValue(null),
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/actions __tests__/lib/media __tests__/lib/utils/practice-access.test.ts __tests__/components/providers __tests__/app/practice-session-bench-sheet-page.test.tsx`
Expected: PASS, including `action-id-sweep.test.ts`, which now finds `practice-logo#getPracticeLogoImage` in the table and passes its malformed and well-formed calls.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add package.json bun.lock lib/utils/practice-access.ts lib/media/logo-image.ts lib/actions/practice-logo.ts \
  lib/actions/practice-session-queries.ts lib/planner-store/types.ts components/providers/HostedPlannerProvider.tsx \
  __tests__/helpers/planner.tsx __tests__/helpers/action-id-sweep-table.ts \
  __tests__/lib/utils/practice-access.test.ts __tests__/lib/media/logo-image.test.ts __tests__/lib/actions/practice-logo.test.ts \
  __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/action-id-arguments-readers.test.ts \
  __tests__/components/providers/HostedPlannerProvider.test.tsx
/usr/bin/git commit -m "feat(practice-planner): team logo for bench sheet exports, read on the server" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Static "Your team" profile in the store

**Files:**
- Modify: `apps/planner/src/store/records.ts` (`META_TEAM_PROFILE`)
- Create: `apps/planner/src/store/team-profile.ts`
- Modify: `apps/planner/src/store/types.ts` (`LocalPlannerStore`)
- Modify: `apps/planner/src/store/local-store.ts`
- Modify: `apps/planner/src/store/sessions.ts` (`getSessionView`: `teamName`, `teamMark`; drop `LOCAL_TEAM_NAME`)
- Modify: `apps/planner/src/config.ts` (delete `LOCAL_TEAM_NAME`)
- Test (create): `__tests__/apps/planner/local-store.team-profile.test.ts`
- Test (breaks, fix here): `__tests__/apps/planner/local-store.sessions.test.ts`. Line 7 imports `LOCAL_TEAM_NAME`, and line 231 expects `teamName: LOCAL_TEAM_NAME`; it becomes `teamName: ""`.

**Interfaces:**
- Consumes: `TeamProfile`, `TeamMark` (Task 1); `TeamProfileInput`, `teamProfileError`, `toTeamProfile`, `readTeamProfile`, `toTeamMark` (Task 1).
- Produces, on `LocalPlannerStore`:
  - `getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>`;
  - `saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>`;
  - `clearTeamProfile: () => Promise<ActionResult<null>>`;
  - `subscribeTeamProfile: (listener: () => void) => () => void`;
  - `teamProfileVersion: () => number` (starts at 0, +1 after each successful save or clear).
- Produces: `getSessionView` returns `teamName: profile?.name ?? ""` and `teamMark: profile ? toTeamMark(profile, LOCAL_TEAM_ID) : null`. Also `META_TEAM_PROFILE = "teamProfile"`, `TEAM_PROFILE_LOAD_FAILED`, `TEAM_PROFILE_SAVE_FAILED`.

- [ ] **Step 1: Write the failing store tests**

Create `__tests__/apps/planner/local-store.team-profile.test.ts`:

```ts
/** The static planner's "Your team" profile (practice logo spec R4), against both repos. */
import { describe, expect, it, vi } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_TEAM_PROFILE } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import {
    TEAM_COLOR_MESSAGE,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_NAME_LENGTH_MESSAGE,
    TEAM_NAME_REQUIRED_MESSAGE,
    type TeamProfileInput,
} from "@/lib/utils/team-mark";
import type { ActionResult } from "@/lib/planner-store";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
const HAWKS: TeamProfileInput = { name: " Ice\u0007  Hawks ", logo: LOGO, primaryColor: "#9b1b30", secondaryColor: null };

function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe.each(REPOS)("team profile (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        const store = createLocalPlannerStore(h.repo, h.options);
        const session = data(await store.createSession({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] }));
        return { ...h, store, sessionId: session.id };
    }

    it("has no profile on a device that never set one: no team name, no mark", async () => {
        const { store, sessionId } = await setup();
        expect(data(await store.getTeamProfile())).toBeNull();
        const view = data(await store.getSessionView(sessionId));
        expect([view.teamName, view.teamMark]).toEqual(["", null]);
        expect(store.teamProfileVersion()).toBe(0);
    });

    it("saves the cleaned profile, and every practice shows its name and mark", async () => {
        const { store, sessionId } = await setup();
        const saved = data(await store.saveTeamProfile(HAWKS));
        expect(saved).toEqual({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null });
        expect(data(await store.getTeamProfile())).toEqual(saved);
        const view = data(await store.getSessionView(sessionId));
        expect(view.teamName).toBe("Ice Hawks");
        expect(view.teamMark).toEqual({ id: LOCAL_TEAM_ID, name: "Ice Hawks", logoUrl: PNG, color: "#9B1B30", logoImage: LOGO });
    });

    it.each([
        [{ name: "  " }, TEAM_NAME_REQUIRED_MESSAGE],
        [{ name: "x".repeat(61) }, TEAM_NAME_LENGTH_MESSAGE],
        [{ primaryColor: "#123" }, TEAM_COLOR_MESSAGE],
        [{ secondaryColor: "red" }, TEAM_COLOR_MESSAGE],
        [{ logo: { dataUrl: "data:image/jpeg;base64,AAAA", width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
        [{ logo: { ...LOGO, width: 513 } }, TEAM_LOGO_INVALID_MESSAGE],
        [{ logo: { dataUrl: `data:image/png;base64,${"A".repeat(273_068)}`, width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
    ] as Array<[Partial<TeamProfileInput>, string]>)("refuses %o with its message and stores nothing", async (overrides, message) => {
        const { store } = await setup();
        expect(await store.saveTeamProfile({ ...HAWKS, ...overrides })).toEqual({ success: false, error: message });
        expect(data(await store.getTeamProfile())).toBeNull();
        expect(store.teamProfileVersion()).toBe(0);
    });

    it("clears the profile, and practices go back to no team", async () => {
        const { store, sessionId } = await setup();
        data(await store.saveTeamProfile(HAWKS));
        expect(data(await store.clearTeamProfile())).toBeNull();
        expect(data(await store.getTeamProfile())).toBeNull();
        expect(data(await store.getSessionView(sessionId)).teamMark).toBeNull();
    });

    it("reads a damaged record leniently: a bad logo drops, a bad name is no profile", async () => {
        const { store, repo } = await setup();
        await repo.write((tx) => tx.putMeta(META_TEAM_PROFILE, { name: "Ice Hawks", logo: { dataUrl: "javascript:x", width: 1, height: 1 }, primaryColor: "#00695C" }));
        expect(data(await store.getTeamProfile())).toEqual({ name: "Ice Hawks", logo: null, primaryColor: "#00695C", secondaryColor: null });
        await repo.write((tx) => tx.putMeta(META_TEAM_PROFILE, { name: 42 }));
        expect(data(await store.getTeamProfile())).toBeNull();
    });

    it("tells subscribers after each save and clear, never after a refusal", async () => {
        const { store } = await setup();
        const listener = vi.fn();
        const unsubscribe = store.subscribeTeamProfile(listener);
        data(await store.saveTeamProfile(HAWKS));
        await store.saveTeamProfile({ ...HAWKS, name: "" });
        data(await store.clearTeamProfile());
        expect(listener).toHaveBeenCalledTimes(2);
        expect(store.teamProfileVersion()).toBe(2);
        unsubscribe();
        data(await store.saveTeamProfile(HAWKS));
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("keeps the profile out of plan files, and an import never changes it", async () => {
        const { store, sessionId } = await setup();
        const saved = data(await store.saveTeamProfile(HAWKS));
        const text = JSON.stringify(buildPlanDocument(data(await store.getSessionView(sessionId)), new Date(), "openleague-static"));
        expect(text).not.toContain(PNG);
        expect(text).not.toContain("Ice Hawks");
        expect(text).not.toContain("teamMark");
        const plan = serializePlan(
            { title: "Imported", durationMinutes: 30, date: "2026-10-08", startTime: "18:00", drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Laps", description: null, playData: createEmptyPlayData() }] },
            "openleague-hosted",
        );
        data(await store.importPlan(plan, { date: new Date("2026-10-08T18:00:00"), addToLibrary: false }));
        expect(data(await store.getTeamProfile())).toEqual(saved);
    });
});
```

In `__tests__/apps/planner/local-store.sessions.test.ts`, change the config import to `import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID } from "@/apps/planner/src/config";` and line 231's `teamName: LOCAL_TEAM_NAME` to `teamName: ""`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/local-store.team-profile.test.ts __tests__/apps/planner/local-store.sessions.test.ts`
Expected: FAIL. `META_TEAM_PROFILE` is not exported, `store.getTeamProfile` is not a function, and the sessions test reads `"This device"`.

- [ ] **Step 3: Implement the profile ops**

In `apps/planner/src/store/records.ts`, after `META_PERSIST_REQUESTED`, add:

```ts
/** The device's "Your team" profile (practice logo spec R4): a TeamProfile, or null once cleared. Never in plan files. */
export const META_TEAM_PROFILE = "teamProfile";
```

Create `apps/planner/src/store/team-profile.ts`:

```ts
/**
 * "Your team" (practice logo spec R4): one device-level record in the meta
 * store. Validated on write (teamProfileError) and read leniently
 * (readTeamProfile), so a damaged record never breaks a practice. Screens
 * subscribe to hear about changes made in this tab.
 */
import type { ActionResult } from "@/lib/planner-store";
import { readTeamProfile, teamProfileError, toTeamProfile, type TeamProfileInput } from "@/lib/utils/team-mark";
import type { TeamProfile } from "@/types/practice-planner";
import { META_TEAM_PROFILE } from "./records";
import { attempt, ok, write, type StoreContext } from "./shared";

export const TEAM_PROFILE_LOAD_FAILED = "Couldn't load your team. Please try again.";
export const TEAM_PROFILE_SAVE_FAILED = "Couldn't save your team. Please try again.";

export interface TeamProfileOps {
    getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>;
    saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>;
    clearTeamProfile: () => Promise<ActionResult<null>>;
    subscribeTeamProfile: (listener: () => void) => () => void;
    teamProfileVersion: () => number;
}

export function createTeamProfileOps(ctx: StoreContext): TeamProfileOps {
    const listeners = new Set<() => void>();
    let version = 0;
    const changed = () => {
        version += 1;
        for (const listener of listeners) listener();
    };
    return {
        getTeamProfile: () =>
            attempt(TEAM_PROFILE_LOAD_FAILED, async () => ok(readTeamProfile(await ctx.repo.read((tx) => tx.getMeta(META_TEAM_PROFILE))))),

        saveTeamProfile: (input) =>
            attempt(TEAM_PROFILE_SAVE_FAILED, async () => {
                const error = teamProfileError(input);
                if (error) return { success: false, error };
                const profile = toTeamProfile(input);
                await write(ctx, (tx) => tx.putMeta(META_TEAM_PROFILE, profile));
                changed();
                return ok(profile);
            }),

        clearTeamProfile: () =>
            attempt(TEAM_PROFILE_SAVE_FAILED, async () => {
                await write(ctx, (tx) => tx.putMeta(META_TEAM_PROFILE, null));
                changed();
                return ok(null);
            }),

        subscribeTeamProfile: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        teamProfileVersion: () => version,
    };
}
```

In `apps/planner/src/store/types.ts`, add the imports `import type { TeamProfileInput } from "@/lib/utils/team-mark";` and `TeamProfile` to the `@/types/practice-planner` type import, and append to `LocalPlannerStore`:

```ts
    /** "Your team" (practice logo spec R4). */
    getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>;
    saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>;
    clearTeamProfile: () => Promise<ActionResult<null>>;
    /** Called after each save or clear in this tab; returns the unsubscribe. */
    subscribeTeamProfile: (listener: () => void) => () => void;
    /** Starts at 0 and goes up by one per save or clear: a useSyncExternalStore snapshot. */
    teamProfileVersion: () => number;
```

In `apps/planner/src/store/local-store.ts`, add `import { createTeamProfileOps } from "./team-profile";` and change the return to:

```ts
    return { ...createLibraryOps(ctx), ...createSessionOps(ctx), ...createTeamProfileOps(ctx) };
```

In `apps/planner/src/store/sessions.ts`:
- change the config import to `import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID } from "../config";`;
- add `import { META_TEAM_PROFILE } from "./records";` beside the existing type import from `./records`;
- add `import { readTeamProfile, toTeamMark } from "@/lib/utils/team-mark";`;
- in `getSessionView`, right after `const { session, plays } = found;`, add:

```ts
                // The device's "Your team" (spec R4); none: no team name and no mark, as before.
                const profile = readTeamProfile(await ctx.repo.read((tx) => tx.getMeta(META_TEAM_PROFILE)));
```

- and replace `teamName: LOCAL_TEAM_NAME,` with:

```ts
                    teamName: profile?.name ?? "",
                    teamMark: profile ? toTeamMark(profile, LOCAL_TEAM_ID) : null,
```

In `apps/planner/src/config.ts`, delete `export const LOCAL_TEAM_NAME = "This device";`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rg -n "LOCAL_TEAM_NAME" apps lib components __tests__`
Expected: no output.

Run: `bun run test __tests__/apps/planner`
Expected: PASS for both repos (memory and IndexedDB).

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/planner/src/store/records.ts apps/planner/src/store/team-profile.ts apps/planner/src/store/types.ts \
  apps/planner/src/store/local-store.ts apps/planner/src/store/sessions.ts apps/planner/src/config.ts \
  __tests__/apps/planner/local-store.team-profile.test.ts __tests__/apps/planner/local-store.sessions.test.ts
/usr/bin/git commit -m "feat(planner): device team profile in the static planner store" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Static "Your team" dialog, logo upload and refresh on change

**Files:**
- Create: `lib/utils/canvas/logo-file.ts`
- Create: `apps/planner/src/screens/useTeamProfile.ts`
- Create: `apps/planner/src/screens/YourTeam.tsx` (`YourTeamButton`, `TeamProfileDialog`)
- Modify: `apps/planner/src/screens/useStoreResult.ts` (optional `refreshKey`)
- Modify: `apps/planner/src/screens/AppShell.tsx` (`teamControl` slot in the title row)
- Modify: `apps/planner/src/App.tsx` (passes `<YourTeamButton store={store} />`)
- Modify: `apps/planner/src/screens/SessionDetailScreen.tsx`, `apps/planner/src/screens/BenchSheetScreen.tsx` (reload on a profile change)
- Test (create): `__tests__/lib/utils/canvas/logo-file.test.ts`, `__tests__/apps/planner/your-team.test.tsx`
- Existing tests that must stay green: `__tests__/apps/planner/app.test.tsx`. Its nav assertions use `within(nav)`, and the new button sits outside the `nav` element.

**Interfaces:**
- Consumes: `LogoImage`, `TeamProfile` (Task 1); `LOGO_ACCEPT`, `fitWithin`, `sniffLogoType` and the limits (Task 1); `isPngDataUri`, `pngDataUriByteLength`, `MAX_PNG_DATA_URI_LENGTH` (Task 1); `teamProfileErrors`, `TEAM_NAME_MAX`, `isTeamColor`, `TeamProfileInput` (Task 1); the `LocalPlannerStore` profile methods (Task 3).
- Produces:
  - `LOGO_TYPE_MESSAGE`, `LOGO_FILE_SIZE_MESSAGE`, `LOGO_UNREADABLE_MESSAGE`, `LOGO_TOO_DETAILED_MESSAGE`;
  - `LogoFileResult = { ok: true; logo: LogoImage } | { ok: false; error: string }`, `normalizeLogoFile(file: Blob): Promise<LogoFileResult>`;
  - `useTeamProfileVersion(store: LocalPlannerStore): number`;
  - `useStoreResult<T>(load, refreshKey?: unknown)`;
  - `YourTeamButton({ store })`, `TeamProfileDialog({ store, initial, onClose })`;
  - `AppShell`'s `teamControl?: ReactNode`.

- [ ] **Step 1: Write the failing upload tests**

Create `__tests__/lib/utils/canvas/logo-file.test.ts`. `createImageBitmap` doesn't exist in jsdom, so the test stubs it. Canvas output comes from spying `toDataURL`, with the recording-context pattern for `drawImage`:

```ts
/** normalizeLogoFile: the static upload (practice logo spec R4), the browser half of the shared normalization rule. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    LOGO_FILE_SIZE_MESSAGE,
    LOGO_TOO_DETAILED_MESSAGE,
    LOGO_TYPE_MESSAGE,
    LOGO_UNREADABLE_MESSAGE,
    normalizeLogoFile,
} from "@/lib/utils/canvas/logo-file";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const OVER_CAP = `data:image/png;base64,${"A".repeat(273_068)}`; // 204,801 bytes
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const file = (head: number[], size = 64, type = "image/png") => {
    const bytes = new Uint8Array(size);
    bytes.set(head);
    return new File([bytes], "logo.png", { type });
};

let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
let ctx: Record<string, ReturnType<typeof vi.fn>>;
let sizes: Array<[number, number]>;

beforeEach(() => {
    bitmap = { width: 1024, height: 256, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    ctx = { drawImage: vi.fn() };
    sizes = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
        sizes.push([this.width, this.height]);
        return ctx;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(PNG);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("normalizeLogoFile", () => {
    it("fits the image within 512, keeps the ratio, encodes PNG and frees the bitmap", async () => {
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: true, logo: { dataUrl: PNG, width: 512, height: 128 } });
        expect(sizes).toEqual([[512, 128]]);
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 512, 128);
        expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
        expect(bitmap.close).toHaveBeenCalled();
    });

    it("encodes again within 256 when the 512 PNG is over 200 KB", async () => {
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce(OVER_CAP).mockReturnValueOnce(PNG);
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: true, logo: { dataUrl: PNG, width: 256, height: 64 } });
        expect(sizes).toEqual([[512, 128], [256, 64]]);
    });

    it("refuses a logo still over 200 KB at 256", async () => {
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue(OVER_CAP);
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_TOO_DETAILED_MESSAGE });
        expect(bitmap.close).toHaveBeenCalled();
    });

    it("accepts JPEG and WebP by their bytes, and never upscales", async () => {
        bitmap = { width: 100, height: 40, close: vi.fn() };
        expect(await normalizeLogoFile(file([0xff, 0xd8, 0xff, 0xe0], 64, "image/jpeg"))).toMatchObject({ ok: true, logo: { width: 100, height: 40 } });
        const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
        expect(await normalizeLogoFile(file(webp, 64, "image/webp"))).toMatchObject({ ok: true });
    });

    it("refuses an SVG renamed .png and a GIF by their bytes, before decoding", async () => {
        const svg = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')];
        expect(await normalizeLogoFile(file(svg, 64))).toEqual({ ok: false, error: LOGO_TYPE_MESSAGE });
        expect(await normalizeLogoFile(file([...new TextEncoder().encode("GIF89a")]))).toEqual({ ok: false, error: LOGO_TYPE_MESSAGE });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it("refuses a file over 2 MB", async () => {
        expect(await normalizeLogoFile(file(PNG_HEAD, 2 * 1024 * 1024 + 1))).toEqual({ ok: false, error: LOGO_FILE_SIZE_MESSAGE });
    });

    it("refuses an image the browser can't decode, or a canvas that gives no PNG", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException("bad", "InvalidStateError"));
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue("data:,");
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/logo-file.test.ts`
Expected: FAIL with "Failed to resolve import" for `@/lib/utils/canvas/logo-file`.

- [ ] **Step 3: Implement the upload normalization**

Create `lib/utils/canvas/logo-file.ts`:

```ts
/**
 * The static planner's logo upload (practice logo spec R4): the browser half
 * of the rule lib/media/logo-image.ts applies on the server. The type comes
 * from the file's bytes; the image is decoded with createImageBitmap, drawn
 * within 512×512 and stored as PNG; over 200 KB it is drawn again within 256;
 * still over, it is refused.
 */
import {
    LOGO_IMAGE_FALLBACK_PX,
    LOGO_IMAGE_MAX_PX,
    LOGO_MAX_BYTES,
    MAX_LOGO_PNG_BYTES,
    fitWithin,
    sniffLogoType,
} from "@/lib/media/logo-rules";
import { MAX_PNG_DATA_URI_LENGTH, isPngDataUri, pngDataUriByteLength } from "@/lib/utils/png-data-uri";
import type { LogoImage } from "@/types/practice-planner";

export const LOGO_TYPE_MESSAGE = "Use a PNG, JPEG or WebP image.";
export const LOGO_FILE_SIZE_MESSAGE = "Use an image of 2 MB or less.";
export const LOGO_UNREADABLE_MESSAGE = "This image couldn't be read. Try another file.";
export const LOGO_TOO_DETAILED_MESSAGE = "This logo is too detailed to store. Try a simpler image.";

export type LogoFileResult = { ok: true; logo: LogoImage } | { ok: false; error: string };

const refuse = (error: string): LogoFileResult => ({ ok: false, error });

export async function normalizeLogoFile(file: Blob): Promise<LogoFileResult> {
    if (file.size > LOGO_MAX_BYTES) return refuse(LOGO_FILE_SIZE_MESSAGE);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!sniffLogoType(head)) return refuse(LOGO_TYPE_MESSAGE);

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (error) {
        console.warn("Logo upload: the image couldn't be decoded:", error instanceof Error ? error.name : "unknown error");
        return refuse(LOGO_UNREADABLE_MESSAGE);
    }
    try {
        if (!(bitmap.width > 0 && bitmap.height > 0)) return refuse(LOGO_UNREADABLE_MESSAGE);
        for (const side of [LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX]) {
            const size = fitWithin(bitmap.width, bitmap.height, side);
            const canvas = document.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return refuse(LOGO_UNREADABLE_MESSAGE);
            ctx.drawImage(bitmap, 0, 0, size.width, size.height);
            const dataUrl = canvas.toDataURL("image/png");
            if (!dataUrl.startsWith("data:image/png;base64,")) return refuse(LOGO_UNREADABLE_MESSAGE);
            const fits = dataUrl.length <= MAX_PNG_DATA_URI_LENGTH && isPngDataUri(dataUrl) && pngDataUriByteLength(dataUrl) <= MAX_LOGO_PNG_BYTES;
            if (fits) return { ok: true, logo: { dataUrl, width: size.width, height: size.height } };
        }
        return refuse(LOGO_TOO_DETAILED_MESSAGE);
    } finally {
        bitmap.close();
    }
}
```

Run: `bun run test __tests__/lib/utils/canvas/logo-file.test.ts`
Expected: PASS. If jsdom's `Blob` has no `arrayBuffer()`, read the head with `await new Response(file.slice(0, 16)).arrayBuffer()` instead (both are standard; keep whichever jsdom and browsers both run).

- [ ] **Step 4: Write the failing dialog tests**

Create `__tests__/apps/planner/your-team.test.tsx`:

```tsx
/** "Your team" (practice logo spec R4): the app bar button, the dialog, and screens that reload on a change. */
import { useCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
const { mockNormalize } = vi.hoisted(() => ({ mockNormalize: vi.fn() }));
vi.mock("@/lib/utils/canvas/logo-file", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/logo-file")>()),
    normalizeLogoFile: mockNormalize,
}));

import { YourTeamButton } from "@/apps/planner/src/screens/YourTeam";
import { useStoreResult } from "@/apps/planner/src/screens/useStoreResult";
import { LOGO_TYPE_MESSAGE } from "@/lib/utils/canvas/logo-file";
import { TEAM_COLOR_MESSAGE, TEAM_NAME_REQUIRED_MESSAGE } from "@/lib/utils/team-mark";

const pick = () => fireEvent.change(screen.getByTestId("team-logo-input"), { target: { files: [new File([new Uint8Array(8)], "logo.png", { type: "image/png" })] } });

async function openDialog() {
    fireEvent.click(await screen.findByRole("button", { name: "Your team" }));
    return screen.findByRole("dialog", { name: "Your team" });
}

describe("YourTeamButton and the Your team dialog", () => {
    it("saves a name, a logo and a color, and the button then shows the team's crest", async () => {
        mockNormalize.mockResolvedValue({ ok: true, logo: LOGO });
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        fireEvent.change(screen.getByRole("textbox", { name: "Team name" }), { target: { value: "  Ice Hawks " } });
        pick();
        await screen.findByRole("button", { name: "Replace logo" });
        fireEvent.change(screen.getByRole("textbox", { name: "Primary color" }), { target: { value: "#9b1b30" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toEqual({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null });
        const button = screen.getByRole("button", { name: "Your team" });
        await waitFor(() => expect(button.querySelector(`img[src="${PNG}"]`)).not.toBeNull());
    });

    it("shows each field's problem on Save and stores nothing", async () => {
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        fireEvent.change(screen.getByRole("textbox", { name: "Secondary color" }), { target: { value: "red" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText(TEAM_NAME_REQUIRED_MESSAGE)).toBeInTheDocument();
        expect(screen.getByText(TEAM_COLOR_MESSAGE)).toBeInTheDocument();
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toBeNull();
    });

    it("says why an upload was refused, and removes a logo", async () => {
        const { store } = memoryStore();
        await store.saveTeamProfile({ name: "Ice Hawks", logo: LOGO, primaryColor: null, secondaryColor: null });
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        mockNormalize.mockResolvedValue({ ok: false, error: LOGO_TYPE_MESSAGE });
        pick();
        expect(await screen.findByText(LOGO_TYPE_MESSAGE)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
        expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data?.logo).toBeNull();
    });

    it("offers Clear team only once a team is saved, and clears it", async () => {
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        expect(screen.queryByRole("button", { name: "Clear team" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => {
            await store.saveTeamProfile({ name: "Ice Hawks", logo: null, primaryColor: null, secondaryColor: null });
        });
        // Wait for the button's reread (its crest) before reopening, so the dialog opens with the saved team.
        await screen.findByText("IH");
        await openDialog();
        fireEvent.click(screen.getByRole("button", { name: "Clear team" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toBeNull();
    });

    it("gives every control a 44 px target", async () => {
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        expect(getComputedStyle(await screen.findByRole("button", { name: "Your team" })).minHeight).toBe("44px");
        await openDialog();
        for (const name of ["Upload logo", "Cancel", "Save"]) {
            expect(getComputedStyle(screen.getByRole("button", { name })).minHeight, name).toBe("44px");
        }
        for (const name of ["Pick primary color", "Pick secondary color"]) {
            const picker = screen.getByLabelText(name);
            expect([getComputedStyle(picker).width, getComputedStyle(picker).height], name).toEqual(["44px", "44px"]);
        }
    });
});

describe("useStoreResult refresh key", () => {
    it("reads again when the key changes, keeping the last result meanwhile", async () => {
        const load = vi.fn().mockResolvedValueOnce({ success: true, data: "first" }).mockResolvedValueOnce({ success: true, data: "second" });
        function Probe({ refresh }: { refresh: number }) {
            const stable = useCallback(() => load(), []);
            const state = useStoreResult(stable, refresh);
            return <p>{state.kind === "ready" ? state.data : state.kind}</p>;
        }
        const { rerender } = render(<Probe refresh={0} />);
        expect(await screen.findByText("first")).toBeInTheDocument();
        rerender(<Probe refresh={1} />);
        expect(screen.getByText("first")).toBeInTheDocument();
        expect(await screen.findByText("second")).toBeInTheDocument();
        expect(load).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/your-team.test.tsx`
Expected: FAIL with "Failed to resolve import" for `@/apps/planner/src/screens/YourTeam`.

- [ ] **Step 6: Implement the refresh plumbing**

Replace the hook signature and effect dependencies in `apps/planner/src/screens/useStoreResult.ts`:

```ts
/**
 * Runs a store read when `load` changes (memoize it with useCallback), and
 * again when `refreshKey` changes (the last result stays up meanwhile).
 * Screens are keyed by id, so state resets per record.
 */
export function useStoreResult<T>(load: () => Promise<ActionResult<T>>, refreshKey: unknown = null): LoadState<T> {
```

and change the effect's dependency list from `[load]` to `[load, refreshKey]`.

Create `apps/planner/src/screens/useTeamProfile.ts`:

```ts
import { useSyncExternalStore } from "react";
import type { LocalPlannerStore } from "../store/types";

/** Goes up each time this tab saves or clears "Your team": pass it to useStoreResult to read again. */
export function useTeamProfileVersion(store: LocalPlannerStore): number {
    return useSyncExternalStore(store.subscribeTeamProfile, store.teamProfileVersion, () => 0);
}
```

In `apps/planner/src/screens/SessionDetailScreen.tsx` and `apps/planner/src/screens/BenchSheetScreen.tsx`, add `import { useTeamProfileVersion } from "./useTeamProfile";` and replace `const state = useStoreResult(load);` with:

```ts
    // A "Your team" change shows on an open practice without a reload (practice logo spec R4).
    const state = useStoreResult(load, useTeamProfileVersion(store));
```

- [ ] **Step 7: Implement the dialog and the button**

Create `apps/planner/src/screens/YourTeam.tsx`:

```tsx
/**
 * "Your team" (practice logo spec R4): the device's team name, logo and
 * colors, shown on every practice on this device. Plan files never include it.
 */
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DeleteOutline as RemoveIcon, FileUploadOutlined as UploadIcon, GroupsOutlined as TeamIcon } from "@mui/icons-material";
import { Crest } from "@/components/ui/Crest";
import { LOGO_ACCEPT } from "@/lib/media/logo-rules";
import { normalizeLogoFile } from "@/lib/utils/canvas/logo-file";
import { TEAM_NAME_MAX, isTeamColor, teamProfileErrors, type TeamProfileField, type TeamProfileInput } from "@/lib/utils/team-mark";
import type { LogoImage, TeamProfile } from "@/types/practice-planner";
import { LOCAL_TEAM_ID } from "../config";
import type { LocalPlannerStore } from "../store/types";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

export const YOUR_TEAM_INTRO = "Shown on your practices, bench sheets and exports on this device. Plan files never include it.";
const TARGET = { minHeight: 44 } as const;

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            error={Boolean(error)}
            helperText={error ?? "Optional, like #0D47A1"}
            placeholder="#0D47A1"
            fullWidth
            slotProps={{
                htmlInput: { maxLength: 7, spellCheck: false, autoCapitalize: "off" },
                input: {
                    endAdornment: (
                        <Box
                            component="input"
                            type="color"
                            aria-label={`Pick ${label.toLowerCase()}`}
                            value={isTeamColor(value) ? value.toLowerCase() : "#0d47a1"}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.toUpperCase())}
                            sx={{ width: 44, height: 44, minWidth: 44, p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", flexShrink: 0 }}
                        />
                    ),
                },
            }}
        />
    );
}

export function TeamProfileDialog({ store, initial, onClose }: { store: LocalPlannerStore; initial: TeamProfile | null; onClose: () => void }) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const fileInput = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(initial?.name ?? "");
    const [logo, setLogo] = useState<LogoImage | null>(initial?.logo ?? null);
    const [primary, setPrimary] = useState(initial?.primaryColor ?? "");
    const [secondary, setSecondary] = useState(initial?.secondaryColor ?? "");
    const [submitted, setSubmitted] = useState(false);
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const input: TeamProfileInput = { name, logo, primaryColor: primary.trim() || null, secondaryColor: secondary.trim() || null };
    const errors: Partial<Record<TeamProfileField, string>> = submitted ? teamProfileErrors(input) : {};

    const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setReading(true);
        const result = await normalizeLogoFile(file);
        setReading(false);
        if (result.ok) {
            setLogo(result.logo);
            setLogoError(null);
        } else {
            setLogoError(result.error);
        }
    };

    const save = async () => {
        setSubmitted(true);
        if (Object.keys(teamProfileErrors(input)).length > 0) return;
        setBusy(true);
        const result = await store.saveTeamProfile(input);
        setBusy(false);
        if (result.success) onClose();
        else setSaveError(result.error);
    };

    const clear = async () => {
        setBusy(true);
        const result = await store.clearTeamProfile();
        setBusy(false);
        if (result.success) onClose();
        else setSaveError(result.error);
    };

    return (
        <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="your-team-title">
            <DialogTitle id="your-team-title" sx={{ fontWeight: 800 }}>
                Your team
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                        {YOUR_TEAM_INTRO}
                    </Typography>
                    <TextField
                        label="Team name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        error={Boolean(errors.name)}
                        helperText={errors.name ?? `Up to ${TEAM_NAME_MAX} characters`}
                        required
                        fullWidth
                        autoFocus
                    />
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Crest
                            name={name.trim() || "Team"}
                            id={LOCAL_TEAM_ID}
                            logoUrl={logo?.dataUrl ?? null}
                            brandColor={isTeamColor(primary) ? primary : null}
                            size="lg"
                        />
                        <Stack spacing={1} sx={{ minWidth: 0 }}>
                            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInput.current?.click()} disabled={reading || busy} sx={TARGET}>
                                {logo ? "Replace logo" : "Upload logo"}
                            </Button>
                            {logo && (
                                <Button color="error" startIcon={<RemoveIcon />} onClick={() => setLogo(null)} disabled={busy} sx={TARGET}>
                                    Remove logo
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                    <input ref={fileInput} type="file" hidden accept={LOGO_ACCEPT} data-testid="team-logo-input" onChange={(event) => void chooseLogo(event)} />
                    <Typography variant="body2" color="text.secondary">
                        PNG, JPEG or WebP, up to 2 MB.
                    </Typography>
                    {(logoError || errors.logo) && <Alert severity="error">{logoError ?? errors.logo}</Alert>}
                    <ColorField label="Primary color" value={primary} onChange={setPrimary} error={errors.primaryColor} />
                    <ColorField label="Secondary color" value={secondary} onChange={setSecondary} error={errors.secondaryColor} />
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
                {initial && (
                    <Button color="error" onClick={() => void clear()} disabled={busy} sx={{ ...TARGET, mr: "auto" }}>
                        Clear team
                    </Button>
                )}
                <Button onClick={onClose} disabled={busy} sx={TARGET}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => void save()} disabled={busy || reading} sx={TARGET}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** The app bar's entry point: the team's crest (or a team icon) and "Your team". */
export function YourTeamButton({ store }: { store: LocalPlannerStore }) {
    const load = useCallback(() => store.getTeamProfile(), [store]);
    const state = useStoreResult(load, useTeamProfileVersion(store));
    const [open, setOpen] = useState(false);
    const profile = state.kind === "ready" ? state.data : null;
    return (
        <>
            <Button
                color="inherit"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
                disabled={state.kind === "loading"}
                startIcon={
                    profile ? (
                        <Crest name={profile.name} id={LOCAL_TEAM_ID} logoUrl={profile.logo?.dataUrl ?? null} brandColor={profile.primaryColor} size="xs" />
                    ) : (
                        <TeamIcon />
                    )
                }
                sx={{ minHeight: 44, minWidth: 44, whiteSpace: "nowrap", flexShrink: 0 }}
            >
                Your team
            </Button>
            {open && <TeamProfileDialog store={store} initial={profile} onClose={() => setOpen(false)} />}
        </>
    );
}
```

In `apps/planner/src/screens/AppShell.tsx`:
- add `teamControl,` to the destructured props and `/** The "Your team" button, beside the title. */ teamControl?: ReactNode;` to the props type;
- wrap the title `Typography` in a row that keeps the title and the button together on phones. Replace the opening `<Typography component="a" … flexBasis: { xs: "100%", sm: "auto" }, …>` element and its closing tag with:

```tsx
                    <Box sx={{ display: "flex", alignItems: "center", columnGap: 1, flexGrow: 1, flexBasis: { xs: "100%", sm: "auto" }, minWidth: 0 }}>
                        <Typography
                            component="a"
                            href={staticRoutes.list()}
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                letterSpacing: "-0.02em",
                                color: "inherit",
                                flexGrow: 1,
                                fontSize: { xs: "1.0625rem", sm: "1.25rem" },
                                lineHeight: { xs: "36px", sm: "inherit" },
                            }}
                        >
                            OpenLeague Planner
                        </Typography>
                        {teamControl}
                    </Box>
```

In `apps/planner/src/App.tsx`, add `import { YourTeamButton } from "./screens/YourTeam";` and pass `teamControl={<YourTeamButton store={store} />}` to `AppShell`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner __tests__/lib/utils/canvas/logo-file.test.ts`
Expected: PASS, including `app.test.tsx` unchanged.

Run: `bun run type-check && bun run lint`
Expected: exit 0, no new warnings in the touched files.

- [ ] **Step 9: Screenshots (light and dark, desktop and mobile)**

Run `bun run planner:build`, then start the preview in the background (Bash `run_in_background: true`): `bun run planner:preview --port 4199 --strictPort`.

Write `<scratchpad>/pwcheck/logo-task4.mjs`:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const BASE = "http://localhost:4199/";
/** A 600×240 wordmark PNG, drawn in the page (the harness has no image library). */
async function wordmark(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 240;
    const x = c.getContext("2d");
    x.fillStyle = "#9B1B30"; x.fillRect(0, 0, 600, 240);
    x.fillStyle = "#fff"; x.font = "bold 120px sans-serif"; x.fillText("HAWKS", 40, 170);
    return c.toDataURL("image/png").split(",")[1];
  });
  return { name: "hawks.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE);
    const button = page.getByRole("button", { name: "Your team" });
    await button.waitFor({ timeout: 20000 });
    await page.screenshot({ path: `logo-task4-bar-${tag}-${scheme}.png` });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Your team" });
    await dialog.getByRole("textbox", { name: "Team name" }).fill("Ice Hawks");
    await page.locator('[data-testid="team-logo-input"]').setInputFiles(await wordmark(page));
    await dialog.getByRole("button", { name: "Replace logo" }).waitFor();
    await dialog.getByRole("textbox", { name: "Primary color" }).fill("#9B1B30");
    const small = await dialog.locator("button, input[type=color]").evaluateAll((els) =>
      els.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((el) => el.getAttribute("aria-label") || el.textContent));
    console.log(scheme, tag, "dialog controls under 44px:", small);
    await page.screenshot({ path: `logo-task4-dialog-${tag}-${scheme}.png` });
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
    console.log(scheme, tag, "button crest img:", await button.locator("img").count());
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.screenshot({ path: `logo-task4-saved-${tag}-${scheme}.png` });
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && node logo-task4.mjs` (with `CHROMIUM_PATH` set to the local Chromium headless shell).
Expected output: no `pageerror`; "dialog controls under 44px: []"; "button crest img: 1"; overflow 0.

Read every `logo-task4-*.png`. Check all of these, then fix and re-run until they hold:
- At 390 px the title and the Your team button share one row, the nav row stays below, and nothing overflows.
- The dialog is full screen on mobile.
- The wordmark sits whole inside the Crest preview (contained, not cropped).
- In dark mode no surface is white and every text is readable.

Stop the preview server.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add lib/utils/canvas/logo-file.ts apps/planner/src/screens/useTeamProfile.ts apps/planner/src/screens/YourTeam.tsx \
  apps/planner/src/screens/useStoreResult.ts apps/planner/src/screens/AppShell.tsx apps/planner/src/App.tsx \
  apps/planner/src/screens/SessionDetailScreen.tsx apps/planner/src/screens/BenchSheetScreen.tsx \
  __tests__/lib/utils/canvas/logo-file.test.ts __tests__/apps/planner/your-team.test.tsx
/usr/bin/git commit -m "feat(planner): Your team dialog with logo upload in the static planner" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: The mark on the session page and the live and printed bench sheet

**Files:**
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (the Crest before the title)
- Create: `components/features/practice-planner/print/TeamMarkImage.tsx`
- Modify: `components/features/practice-planner/print/BenchSheet.tsx` (the mark beside the title; the static leave-out rule removed)
- Test (create): `__tests__/app/practice-session-detail-team-mark.test.tsx`, `__tests__/components/features/practice-planner/print/TeamMarkImage.test.tsx`
- Test (breaks, fix here): `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`. The test "leaves out the placeholder team, as the exports do" passes a `teamName` of `"This device"` with no mark; it is replaced (Step 1).

**Interfaces:**
- Consumes: `TeamMark` (Task 1); `crestPng`, `CREST_EXPORT_PX` (Task 1); `teamLogoAlt` (Task 1); `resolveCrestColor` (`lib/utils/crest.ts`); `useMounted` (`lib/hooks/useClockText`); the static view's `teamName`/`teamMark` (Task 3) and the screen refresh (Task 4).
- Produces: `TeamMarkImage({ mark, height }: { mark: TeamMark; height?: number })`, an `<img>` of the logo, falling back to the Crest PNG on `error` or when there is no logo; it renders nothing when the Crest can't be drawn.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/print/TeamMarkImage.test.tsx`:

```tsx
/** TeamMarkImage: the bench sheet's mark, a logo or the Crest as an image (prints without CSS backgrounds). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { mockCrestPng } = vi.hoisted(() => ({ mockCrestPng: vi.fn(() => "data:image/png;base64,CREST") }));
vi.mock("@/lib/utils/canvas/crest-png", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/crest-png")>()),
    crestPng: mockCrestPng,
}));

import { TeamMarkImage } from "@/components/features/practice-planner/print/TeamMarkImage";

const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png", color: "#9B1B30" };

describe("TeamMarkImage", () => {
    it("shows the logo at 48 px high with the team's alt text", () => {
        render(<TeamMarkImage mark={MARK} />);
        const img = screen.getByRole("img", { name: "Ice Hawks logo" });
        expect(img).toHaveAttribute("src", MARK.logoUrl);
        expect(img.style.height).toBe("48px");
    });

    it("falls back to the Crest when the logo fails to load", () => {
        render(<TeamMarkImage mark={MARK} />);
        fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
        expect(mockCrestPng).toHaveBeenCalledWith({ name: "Ice Hawks", color: "#9B1B30", size: 192 });
    });

    it("draws the Crest in the derived color when there is no logo and no brand color", () => {
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null, color: null }} />);
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
        expect(mockCrestPng.mock.calls.at(-1)?.[0].color).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("renders nothing when the Crest can't be drawn", () => {
        mockCrestPng.mockReturnValueOnce(null as unknown as string);
        const { container } = render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(container.querySelector("img")).toBeNull();
    });
});
```

Create `__tests__/app/practice-session-detail-team-mark.test.tsx`:

```tsx
/** The team mark before the session title (practice logo spec R5), hosted and static. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import { PlannerApp } from "@/apps/planner/src/App";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { memoryStore } from "@/__tests__/apps/planner/render-screen";

const LOGO_URL = "https://abc.public.blob.vercel-storage.com/branding/team/cteamxxxxxxxxxxxxxxxxxxxx/l.png";
const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday Skills", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Ice Hawks", startAt: null, transitionMinutes: 0, plays: [],
};

function renderView(session: PracticeSessionView) {
    return renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
        </ThemeProvider>,
    );
}

/** The h1's row: the Crest is its first child when there is a mark. */
const titleRow = () => screen.getByRole("heading", { level: 1, name: "Tuesday Skills" }).parentElement!;

describe("SessionDetailView: the team mark", () => {
    it("draws the team's logo in a Crest before the title", () => {
        renderView({ ...SESSION, teamMark: { id: SESSION.teamId, name: "Ice Hawks", logoUrl: LOGO_URL, color: null } });
        expect(titleRow().querySelector(`img[src="${LOGO_URL}"]`)).not.toBeNull();
    });

    it("draws the initials on the brand color when the team has no logo", () => {
        renderView({ ...SESSION, teamMark: { id: SESSION.teamId, name: "Ice Hawks", logoUrl: null, color: "#9B1B30" } });
        const initials = screen.getByText("IH");
        expect(titleRow().contains(initials)).toBe(true);
        expect(getComputedStyle(initials.parentElement!).backgroundColor).toBe("rgb(155, 27, 48)");
    });

    it("draws nothing without a mark", () => {
        renderView(SESSION);
        expect(titleRow().querySelector("img")).toBeNull();
        expect(screen.queryByText("IH")).toBeNull();
    });
});

describe("Static session page: Your team", () => {
    it("shows the device team's crest once it is saved, without a reload", async () => {
        const { store } = memoryStore();
        const created = await store.createSession({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] });
        if (!created.success) throw new Error(created.error);
        window.location.hash = `#/sessions/${created.data.id}`;
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await screen.findByRole("heading", { level: 1, name: "Tuesday Skills" });
        expect(screen.queryByText("IH")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Your team" }));
        fireEvent.change(await screen.findByRole("textbox", { name: "Team name" }), { target: { value: "Ice Hawks" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(titleRow().textContent).toContain("IH"));
        window.history.replaceState(null, "", "/");
    });
});
```

In `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`:
- add beside the existing hoisted mocks:

```tsx
vi.mock("@/lib/utils/canvas/crest-png", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/crest-png")>()),
    crestPng: () => "data:image/png;base64,CREST",
}));
```

- replace the whole `describe("BenchSheet in the static planner", …)` block with:

```tsx
describe("BenchSheet: the team and its mark (practice logo spec R5)", () => {
    const renderSheet = (session: BenchSheetSession) =>
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <BenchSheet session={session} />
            </ThemeProvider>,
            { platform: createHashPlatform() },
        );

    it("prints no team line and no mark for a static device without a team", () => {
        renderSheet({ ...SESSION, teamName: "", teamMark: null });
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: / logo$/ })).toBeNull();
    });

    it("prints the static device's team name and its Crest beside the title", () => {
        renderSheet({ ...SESSION, teamName: "Ice Hawks", teamMark: { id: "local", name: "Ice Hawks", logoUrl: null, color: "#9B1B30" } });
        expect(screen.getByText("Ice Hawks")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("prints a hosted team's logo beside the title", () => {
        const logoUrl = "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png";
        renderSheet({ ...SESSION, teamMark: { id: SESSION.teamId, name: SESSION.teamName, logoUrl, color: null } });
        expect(screen.getByRole("img", { name: `${SESSION.teamName} logo` })).toHaveAttribute("src", logoUrl);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/print __tests__/app/practice-session-detail-team-mark.test.tsx`
Expected: FAIL. `TeamMarkImage` doesn't resolve, no Crest is drawn on the session page, and the bench sheet still drops the static team.

- [ ] **Step 3: Implement TeamMarkImage**

Create `components/features/practice-planner/print/TeamMarkImage.tsx`:

```tsx
"use client";

/**
 * The bench sheet's team mark (practice logo spec R5): the logo, else the
 * team's Crest drawn as an image. An image, not the CSS Crest, because
 * browsers drop background colors when printing. A logo that fails to load
 * falls back to the Crest (spec R6).
 */
import { useMemo, useState } from "react";
import { crestPng, CREST_EXPORT_PX } from "@/lib/utils/canvas/crest-png";
import { resolveCrestColor } from "@/lib/utils/crest";
import { teamLogoAlt } from "@/lib/utils/team-mark";
import { useMounted } from "@/lib/hooks/useClockText";
import type { TeamMark } from "@/types/practice-planner";

export function TeamMarkImage({ mark, height = 48 }: { mark: TeamMark; height?: number }) {
    const mounted = useMounted();
    const [failed, setFailed] = useState(false);
    const useLogo = Boolean(mark.logoUrl) && !failed;
    // Canvas needs the DOM: the Crest is drawn after mount, and only when it is shown.
    const crest = useMemo(
        () => (mounted && !useLogo ? crestPng({ name: mark.name, color: resolveCrestColor(mark.id, mark.color), size: CREST_EXPORT_PX }) : null),
        [mounted, useLogo, mark.name, mark.id, mark.color],
    );
    const src = useLogo ? mark.logoUrl : crest;
    if (!src) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL or a blob URL, printed as is; both apps render it
        <img
            src={src}
            alt={teamLogoAlt(mark.name)}
            onError={() => setFailed(true)}
            style={{ height, width: "auto", maxWidth: height * 3, objectFit: "contain", display: "block", flexShrink: 0 }}
        />
    );
}
```

- [ ] **Step 4: Put the mark on the session page and the bench sheet**

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:
- add `import { Crest } from "@/components/ui/Crest";` after the `EmptyState` import;
- in the title row (`<Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>`), insert before the `<Typography variant="h4" component="h1" …>`:

```tsx
              {session.teamMark && (
                <Crest
                  name={session.teamMark.name}
                  id={session.teamMark.id}
                  logoUrl={session.teamMark.logoUrl}
                  brandColor={session.teamMark.color}
                  size="md"
                />
              )}
```

- add `sx={{ fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}` to that `Typography` (replacing its `sx={{ fontWeight: 800 }}`), so a long title wraps beside the 48 px Crest on a phone.

In `components/features/practice-planner/print/BenchSheet.tsx`:
- add `import { TeamMarkImage } from "./TeamMarkImage";`;
- change `const { Link, routes, planGenerator } = usePlannerPlatform();` to `const { Link, routes } = usePlannerPlatform();`;
- replace the two lines

```tsx
    // The static planner's team is the placeholder "This device", not a name (as the exports omit it).
    const teamName = planGenerator === "openleague-static" ? null : session.teamName;
```

with

```tsx
    // A static device without "Your team" has no name: nothing prints (practice logo spec R4).
    const teamName = session.teamName?.trim() || null;
    const mark = teamName ? session.teamMark ?? null : null;
```

- replace the header's title `Typography` with a row holding the mark and the title:

```tsx
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {mark && <TeamMarkImage mark={mark} />}
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 800, minWidth: 0 }}>
                        {session.title}
                    </Typography>
                </Stack>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/print __tests__/app __tests__/apps/planner`
Expected: PASS, including `SessionDetailView.line-budget.test.ts`.

Run: `bun run type-check && wc -l "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"`
Expected: exit 0; about 750 lines (≤ 900).

- [ ] **Step 6: Screenshots: session page and bench sheet**

With the static planner built and served as in Task 4 Step 9, write `<scratchpad>/pwcheck/logo-task5.mjs`:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const BASE = "http://localhost:4199/";
async function wordmark(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 600; c.height = 240;
    const x = c.getContext("2d"); x.fillStyle = "#9B1B30"; x.fillRect(0, 0, 600, 240);
    x.fillStyle = "#fff"; x.font = "bold 120px sans-serif"; x.fillText("HAWKS", 40, 170);
    return c.toDataURL("image/png").split(",")[1];
  });
  return { name: "hawks.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}
async function setTeam(page, withLogo) {
  await page.getByRole("button", { name: "Your team" }).click();
  const dialog = page.getByRole("dialog", { name: "Your team" });
  await dialog.getByRole("textbox", { name: "Team name" }).fill("Ice Hawks");
  if (withLogo) {
    await page.locator('[data-testid="team-logo-input"]').setInputFiles(await wordmark(page));
    await dialog.getByRole("button", { name: "Replace logo" }).waitFor();
  } else if (await dialog.getByRole("button", { name: "Remove logo" }).count()) {
    await dialog.getByRole("button", { name: "Remove logo" }).click();
  }
  await dialog.getByRole("textbox", { name: "Primary color" }).fill("#00695C");
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "detached" });
}
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    const session = page.url();
    for (const withLogo of [false, true]) {
      const kind = withLogo ? "logo" : "crest";
      await setTeam(page, withLogo);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.waitForTimeout(500);
      console.log(scheme, tag, kind, "header images:", await page.getByRole("heading", { level: 1 }).locator("xpath=..").locator("img").count());
      console.log(scheme, tag, kind, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
      await page.screenshot({ path: `logo-task5-session-${kind}-${tag}-${scheme}.png` });
      await page.goto(session + "/print");
      await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(1500);
      console.log(scheme, tag, kind, "bench mark:", await page.getByRole("img", { name: "Ice Hawks logo" }).getAttribute("src").then((s) => s.slice(0, 22)));
      await page.screenshot({ path: `logo-task5-bench-screen-${kind}-${tag}-${scheme}.png`, fullPage: true });
      await page.emulateMedia({ media: "print" });
      await page.screenshot({ path: `logo-task5-bench-${kind}-${tag}-${scheme}.png`, fullPage: true });
      if (tag === "desktop" && scheme === "light") await page.pdf({ path: `logo-task5-bench-${kind}.pdf`, format: "Letter", preferCSSPageSize: true });
      await page.emulateMedia({ media: "screen" });
      await page.goto(session);
    }
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && node logo-task5.mjs` (with `CHROMIUM_PATH` set).
Expected output: no `pageerror`; "header images: 0" for the crest pass (the CSS Crest has no image) and 1 for the logo pass; overflow 0; "bench mark: data:image/png;base64," in both passes.

Read every `logo-task5-*.png` and both PDFs' first pages. Check all of these, then fix and re-run until they hold:
- The 48 px Crest sits before the title on the session page and aligns with its first line.
- At 390 px a long title wraps beside it without overflow.
- The printed bench sheet shows the mark (initials on teal, or the wordmark kept whole) beside the title, and the team name below.
- In print, in both schemes, the Crest keeps its color: it is an image.

Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" \
  components/features/practice-planner/print/TeamMarkImage.tsx components/features/practice-planner/print/BenchSheet.tsx \
  __tests__/app/practice-session-detail-team-mark.test.tsx \
  __tests__/components/features/practice-planner/print/TeamMarkImage.test.tsx \
  __tests__/components/features/practice-planner/print/BenchSheet.test.tsx
/usr/bin/git commit -m "feat(practice-planner): team mark on the session page and the bench sheet" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: The mark in the HTML and Word exports and the static import preview

**Files:**
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts`:
  - `ExportSession` gains `id?` and `teamMark?`;
  - `BenchSheetRenderers` gains `crest`;
  - `BenchSheetModel` gains `mark`;
  - the `omitTeam` option is replaced by `logo`.
- Modify: `components/features/practice-planner/export/bench-sheet-html.ts`, `bench-sheet-docx.ts`, `export-images.ts`, `export-bench-sheet.ts`
- Create: `components/features/practice-planner/export/export-logo.ts`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx`
- Modify: `components/features/practice-planner/PlanPreview.tsx` (`teamMark` prop)
- Modify: `apps/planner/src/screens/ImportScreen.tsx`
- Test (breaks, fix here):
  - `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`: `renderers()` lacks `crest`, and the test "omits the team when asked (static planner) or when it is blank" uses `omitTeam`;
  - `export/bench-sheet-html.test.ts` and `export/bench-sheet-docx.test.ts`: `MODEL` lacks `mark`;
  - `ExportPlanMenu.bench-sheet.test.tsx`: its `export-images` mock lacks `crest`, and the test "leaves the placeholder team out of a static planner export" relies on the removed rule;
  - `export/export-images.test.ts`, `PlanPreview.test.tsx` and `__tests__/apps/planner/import-screen.test.tsx`: these get appended tests.

**Interfaces:**
- Consumes: `LogoImage`, `TeamMark` (Task 1); `isLogoImage`, `teamLogoAlt`, `exportMarkSize`, `EXPORT_MARK_HEIGHT`, `toTeamMark` (Task 1); `crestPng`, `CREST_EXPORT_PX` (Task 1); `resolveCrestColor`; `PlannerStore.getPracticeLogoImage?` (Task 2); `LocalPlannerStore.getTeamProfile`, `LOCAL_TEAM_ID` (Task 3); `useTeamProfileVersion`, `useStoreResult(load, refreshKey)` (Task 4).
- Produces:
  - `BenchSheetMark { image: string; width: number; height: number; alt: string }` and `BenchSheetModel.mark: BenchSheetMark | null`;
  - `BenchSheetRenderers.crest(name: string, color: string): string | null`;
  - `buildBenchSheetModel(session, renderers, options?: { logo?: LogoImage | null })`;
  - `exportBenchSheet(session, format, options: { logo: LogoImage | null })`;
  - `resolveExportLogo(session: ExportSession, fetchLogo?: (sessionId: string) => Promise<LogoImage | null>): Promise<LogoImage | null>`;
  - `PlanPreview({ plan, teamMark }: { plan: PlanDocument; teamMark?: TeamMark | null })`.

- [ ] **Step 1: Write the failing model, HTML and Word tests**

In `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`:
- add `crest: vi.fn(() => "data:image/png;base64,CREST"),` to `renderers()`'s returned object;
- replace the test "omits the team when asked (static planner) or when it is blank" with:

```ts
    it("omits the team when it is blank (a static device without Your team)", () => {
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "   " }, renderers()).teamName).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "" }, renderers()).teamName).toBeNull();
    });
```

- and append:

```ts
describe("buildBenchSheetModel: the team mark (practice logo spec R2, R3, R5)", () => {
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Hawks <U12>", logoUrl: "https://x.blob.vercel-storage.com/a.png", color: "#9B1B30" };

    it("embeds the logo 48 px high, its ratio kept, with the team's alt text", () => {
        const model = buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers(), { logo: { dataUrl: PNG, width: 512, height: 256 } });
        expect(model.mark).toEqual({ image: PNG, width: 96, height: 48, alt: "Hawks <U12> logo" });
    });

    it("fits a wide wordmark within 144 px", () => {
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers(), { logo: { dataUrl: PNG, width: 512, height: 85 } }).mark).toMatchObject({ width: 144, height: 24 });
    });

    it("draws the Crest in the team's color when there is no logo, or the logo isn't a valid PNG", () => {
        const crest = vi.fn(() => "data:image/png;base64,CREST");
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest })).mark).toEqual({ image: "data:image/png;base64,CREST", width: 48, height: 48, alt: "Hawks <U12> logo" });
        expect(crest).toHaveBeenCalledWith("Hawks <U12>", "#9B1B30");
        const bad = buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest }), { logo: { dataUrl: "https://x/a.png", width: 10, height: 10 } });
        expect(bad.mark?.image).toBe("data:image/png;base64,CREST");
    });

    it("shows no mark without a team mark, without a team name, or when the Crest can't be drawn", () => {
        expect(buildBenchSheetModel(BOOKED, renderers()).mark).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "", teamMark: MARK }, renderers()).mark).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest: () => null })).mark).toBeNull();
    });
});
```

In `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`, add `mark: null,` to `MODEL` after `staff: null,`, and append:

```ts
describe("renderBenchSheetHtml: the team mark (practice logo spec R5)", () => {
    const withMark = (mark: BenchSheetModel["mark"]) => renderBenchSheetHtml({ ...MODEL, mark });

    it("puts the mark in the title with its size and escaped alt text, inside the unchanged CSP", () => {
        const html = withMark({ image: PNG, width: 96, height: 48, alt: `Hawks <U12> & "Co" logo` });
        const img = parse(html).querySelector("h1 img.mark");
        expect(img?.getAttribute("src")).toBe(PNG);
        expect([img?.getAttribute("width"), img?.getAttribute("height")]).toEqual(["96", "48"]);
        expect(img?.getAttribute("alt")).toBe(`Hawks <U12> & "Co" logo`);
        expect(html).toContain('alt="Hawks &lt;U12&gt; &amp; &quot;Co&quot; logo"');
        expect(html).toContain(`content="${EXPORT_CSP}"`);
        expect(EXPORT_CSP).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    });

    it("leaves out a mark whose image isn't a PNG data URI, and shows none without a mark", () => {
        expect(parse(withMark({ image: "https://example.com/a.png", width: 48, height: 48, alt: "x logo" })).querySelector("img.mark")).toBeNull();
        expect(parse(withMark(null)).querySelector("img.mark")).toBeNull();
    });
});
```

In `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts`, add `mark: null,` to `MODEL` after `staff: null,`, and append:

```ts
describe("renderBenchSheetDocx: the team mark (practice logo spec R5)", () => {
    it("puts the mark inline at the start of the title, sized, with XML-safe alt text", async () => {
        const xml = await documentXml({ ...MODEL, mark: { image: PNG, width: 96, height: 48, alt: "Hawks <U12>\u0001 logo" } });
        const title = xml.slice(0, xml.indexOf("Tuesday &lt;Skills&gt; &amp; Co"));
        expect(title).toContain("<w:drawing>");
        expect(xml).toContain('descr="Hawks &lt;U12&gt; logo"');
        expect(xml).not.toContain("\u0001");
        // 96 × 48 px in EMUs (9525 per pixel).
        expect(xml).toContain('cx="914400" cy="457200"');
    });

    it("has no title drawing without a mark", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.slice(0, xml.indexOf("Tuesday &lt;Skills&gt; &amp; Co"))).not.toContain("<w:drawing>");
    });
});
```

In `__tests__/components/features/practice-planner/export/export-images.test.ts`, add `vi.mock("@/lib/utils/canvas/crest-png", () => ({ CREST_EXPORT_PX: 192, crestPng: mockCrest }));` with `mockCrest` added to the `vi.hoisted` object (`mockCrest: vi.fn(() => "data:image/png;base64,CREST")`), and append:

```ts
describe("canvasRenderers.crest", () => {
    it("draws the Crest at 192 px for a 48 px export mark", () => {
        expect(canvasRenderers.crest("Ice Hawks", "#9B1B30")).toBe("data:image/png;base64,CREST");
        expect(mockCrest).toHaveBeenCalledWith({ name: "Ice Hawks", color: "#9B1B30", size: 192 });
    });

    it("returns null and warns when drawing throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockCrest.mockImplementationOnce(() => {
            throw new Error("no 2d context");
        });
        expect(canvasRenderers.crest("Ice Hawks", "#9B1B30")).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Write the failing menu, preview and import tests**

In `__tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx`:
- change the `export-images` mock to `canvasRenderers: { diagram: () => PNG, swatch: () => PNG, crest: () => CREST }` and add `const CREST = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggh==";` under `PNG`. It is a second string that passes `isPngDataUri`: `PNG` with one payload character changed, so the tests can tell the Crest from the logo;
- add `createMockPlannerStore` to the `@/__tests__/helpers/planner` import;
- replace the test "leaves the placeholder team out of a static planner export" with the block below:

```tsx
    it("prints no team for a static device without Your team", async () => {
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, teamName: "", teamMark: null }} />, { platform: createHashPlatform() });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        const html = await readText(downloads[0].blob);
        expect(html).not.toContain('class="team"');
        expect(html).not.toContain('class="mark"');
    });

    const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Hawks U12", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png", color: null };
    const HOSTED = { ...SESSION, id: "csessionxxxxxxxxxxxxxxxxx", teamMark: MARK };

    it("embeds the hosted team's logo, fetched through the store", async () => {
        const store = createMockPlannerStore();
        store.getPracticeLogoImage.mockResolvedValue({ dataUrl: PNG, width: 512, height: 512 });
        renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(store.getPracticeLogoImage).toHaveBeenCalledWith("csessionxxxxxxxxxxxxxxxxx");
        expect(await readText(downloads[0].blob)).toContain(`<img class="mark" src="${PNG}" width="48" height="48" alt="Hawks U12 logo">`);
    });

    it.each([
        ["returns no logo", (s: ReturnType<typeof createMockPlannerStore>) => s.getPracticeLogoImage.mockResolvedValue(null)],
        ["fails", (s: ReturnType<typeof createMockPlannerStore>) => s.getPracticeLogoImage.mockRejectedValue(new Error("offline"))],
    ])("still exports, with the Crest, when the logo read %s", async (_label, arrange) => {
        const store = createMockPlannerStore();
        arrange(store);
        renderWithPlanner(<ExportPlanMenu session={HOSTED} />, { store });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(await readText(downloads[0].blob)).toContain(`<img class="mark" src="${CREST}"`);
    });

    it("uses the static profile's stored logo without asking the store", async () => {
        const store = createMockPlannerStore();
        const logo = { dataUrl: PNG, width: 512, height: 256 };
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, teamName: "Ice Hawks", teamMark: { id: "local", name: "Ice Hawks", logoUrl: PNG, color: null, logoImage: logo } }} />, { store, platform: createHashPlatform() });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(store.getPracticeLogoImage).not.toHaveBeenCalled();
        const html = await readText(downloads[0].blob);
        expect(html).toContain('<p class="team">Ice Hawks</p>');
        expect(html).toContain('width="96" height="48" alt="Ice Hawks logo"');
    });
```

In `__tests__/components/features/practice-planner/PlanPreview.test.tsx`, append:

```tsx
describe("PlanPreview: the device team's mark (practice logo spec R5)", () => {
    const plan = () => starterTemplatePlan(STARTER_TEMPLATES[0], "openleague-static", NOW);

    it("shows the mark before the title when given one", () => {
        render(
            <ThemeProvider theme={createTheme()}>
                <PlanPreview plan={plan()} teamMark={{ id: "local", name: "Ice Hawks", logoUrl: null, color: "#00695C" }} />
            </ThemeProvider>,
        );
        expect(screen.getByRole("heading", { level: 2 }).parentElement?.textContent).toContain("IH");
    });

    it("shows no mark without one", () => {
        render(
            <ThemeProvider theme={createTheme()}>
                <PlanPreview plan={plan()} />
            </ThemeProvider>,
        );
        expect(screen.queryByText("IH")).toBeNull();
    });
});
```

In `__tests__/apps/planner/import-screen.test.tsx`, append inside `describe("ImportScreen", …)`:

```tsx
    it("previews the plan with the device team's mark, which the import leaves unchanged", async () => {
        const { store } = memoryStore();
        await store.saveTeamProfile({ name: "Ice Hawks", logo: null, primaryColor: "#00695C", secondaryColor: null });
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        chooseFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json", { type: "application/json" }));
        const title = await screen.findByRole("heading", { level: 2, name: "Tuesday Skills" });
        await waitFor(() => expect(title.parentElement?.textContent).toContain("IH"));
        const profile = await store.getTeamProfile();
        expect(profile.success && profile.data?.name).toBe("Ice Hawks");
    });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/export __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx __tests__/components/features/practice-planner/PlanPreview.test.tsx __tests__/apps/planner/import-screen.test.tsx`
Expected: FAIL. `mark` is undefined, the HTML has no `img.mark`, `canvasRenderers.crest` is not a function, and `PlanPreview` ignores `teamMark`.

- [ ] **Step 4: Implement the model and the renderers**

In `components/features/practice-planner/export/bench-sheet-model.ts`:
- add the imports:

```ts
import type { LogoImage, TeamMark } from "@/types/practice-planner";
import { resolveCrestColor } from "@/lib/utils/crest";
import { EXPORT_MARK_HEIGHT, exportMarkSize, isLogoImage, teamLogoAlt } from "@/lib/utils/team-mark";
```

- in `ExportSession`, add after `title: string;`:

```ts
    /** The practice's id: the hosted logo read takes it. */
    id?: string;
```

  and after `teamName?: string | null;`:

```ts
    /** The team's mark (practice logo spec R5); absent or null: none. */
    teamMark?: TeamMark | null;
```

- add before `BenchSheetModel`:

```ts
/** The team's mark in an export header: a PNG data URI at its drawn size. */
export interface BenchSheetMark {
    image: string;
    width: number;
    height: number;
    /** "<team> logo", unescaped */
    alt: string;
}
```

- in `BenchSheetModel`, after `teamName: string | null;`, add:

```ts
    /** The logo, else the Crest, beside the title; null: none */
    mark: BenchSheetMark | null;
```

- in `BenchSheetRenderers`, add:

```ts
    /** The team's Crest (initials on `color`) as a PNG data URI for a 48 px mark, or null */
    crest(name: string, color: string): string | null;
```

- change the `buildBenchSheetModel` options parameter from `options: { omitTeam?: boolean } = {},` to `options: { logo?: LogoImage | null } = {},`;
- replace `teamName: options.omitTeam || !team ? null : team,` with:

```ts
        teamName: team || null,
        mark: benchSheetMark(session, team, options.logo ?? null, renderers),
```

- add below `buildBenchSheetModel`:

```ts
/** The logo when it is a valid normalized PNG, else the Crest; none without a team (spec R3, R5). */
function benchSheetMark(session: ExportSession, team: string | undefined, logo: LogoImage | null, renderers: BenchSheetRenderers): BenchSheetMark | null {
    const mark = session.teamMark;
    if (!mark || !team) return null;
    const alt = teamLogoAlt(mark.name || team);
    if (logo && isLogoImage(logo)) return { image: logo.dataUrl, ...exportMarkSize(logo), alt };
    const crest = renderers.crest(mark.name || team, resolveCrestColor(mark.id, mark.color));
    return crest ? { image: crest, width: EXPORT_MARK_HEIGHT, height: EXPORT_MARK_HEIGHT, alt } : null;
}
```

In `components/features/practice-planner/export/export-images.ts`, add `import { CREST_EXPORT_PX, crestPng } from "@/lib/utils/canvas/crest-png";` and a third member of `canvasRenderers`:

```ts
    crest(name, color) {
        try {
            return crestPng({ name, color, size: CREST_EXPORT_PX });
        } catch (error) {
            console.warn("Bench sheet export: the team crest couldn't be drawn:", error);
            return null;
        }
    },
```

and add "and the team's Crest" to its doc comment's first sentence.

- [ ] **Step 5: Implement the HTML and Word marks**

In `components/features/practice-planner/export/bench-sheet-html.ts`:
- add `.mark { vertical-align: middle; margin-right: 10px; }` to `STYLES` after the `h2` rule;
- replace `<h1>${model.title}</h1>` in `header()` with:

```ts
<h1>${model.mark && isPngDataUri(model.mark.image) ? html`<img class="mark" src="${model.mark.image}" width="${model.mark.width}" height="${model.mark.height}" alt="${model.mark.alt}">` : null}${model.title}</h1>
```

In `components/features/practice-planner/export/bench-sheet-docx.ts`, replace the first paragraph in `header()` with:

```ts
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
                // The mark inline at the start of the header block (practice logo spec R5).
                ...(model.mark && isPngDataUri(model.mark.image)
                    ? [picture(model.mark.image, { width: model.mark.width, height: model.mark.height }, model.mark.alt), new TextRun({ text: "  " })]
                    : []),
                ...textRuns(model.title, { bold: true, color: LEAGUE_BLUE }),
            ],
        }),
```

- [ ] **Step 6: Resolve the logo in the menu**

Create `components/features/practice-planner/export/export-logo.ts`:

```ts
/**
 * The logo an export embeds (practice logo spec R1, R4): the static profile's
 * stored PNG, else the hosted read through the planner seam. Any failure is
 * null, and the export draws the Crest (spec R6): an export never fails because
 * of its logo.
 */
import type { LogoImage } from "@/types/practice-planner";
import type { ExportSession } from "./bench-sheet-model";

export async function resolveExportLogo(
    session: ExportSession,
    fetchLogo?: (sessionId: string) => Promise<LogoImage | null>,
): Promise<LogoImage | null> {
    const mark = session.teamMark;
    if (!mark?.logoUrl) return null;
    if (mark.logoImage !== undefined) return mark.logoImage;
    if (!session.id || !fetchLogo) return null;
    try {
        return await fetchLogo(session.id);
    } catch (error) {
        console.warn("Bench sheet export: the team logo is unavailable:", error instanceof Error ? error.name : "unknown error");
        return null;
    }
}
```

In `components/features/practice-planner/export/export-bench-sheet.ts`:
- add `import type { LogoImage } from "@/types/practice-planner";`;
- change the options type to `options: { logo: LogoImage | null },`;
- change the model line to `const model = buildBenchSheetModel(session, canvasRenderers, { logo: options.logo });`.

In `components/features/practice-planner/ExportPlanMenu.tsx`:
- import `usePlannerStore` beside `usePlannerPlatform`, and `import { resolveExportLogo } from "./export/export-logo";`;
- add `const store = usePlannerStore();` under the platform line;
- replace the two lines

```tsx
            // The static planner's team is the placeholder "This device", not a name.
            await exportBenchSheet(session, format, { omitTeam: planGenerator === "openleague-static" });
```

with

```tsx
            // The team's logo, else its Crest (practice logo spec R5); never fails the export.
            const logo = await resolveExportLogo(session, store.getPracticeLogoImage);
            await exportBenchSheet(session, format, { logo });
```

- [ ] **Step 7: Show the mark on the import preview**

In `components/features/practice-planner/PlanPreview.tsx`:
- add `import { Crest } from "@/components/ui/Crest";` and `import type { TeamMark } from "@/types/practice-planner";`;
- change the signature to `export function PlanPreview({ plan, teamMark = null }: { plan: PlanDocument; teamMark?: TeamMark | null }) {`;
- wrap the title `Typography` (`variant="h5" component="h2"`) in a row:

```tsx
            <Stack direction="row" spacing={1.5} alignItems="center">
                {teamMark && <Crest name={teamMark.name} id={teamMark.id} logoUrl={teamMark.logoUrl} brandColor={teamMark.color} size="md" />}
                <Typography variant="h5" component="h2" fontWeight={800} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {session.title}
                </Typography>
            </Stack>
```

In `apps/planner/src/screens/ImportScreen.tsx`:
- add the imports `useCallback` (to the React import), `import { toTeamMark } from "@/lib/utils/team-mark";`, `import { LOCAL_TEAM_ID } from "../config";`, `import { useStoreResult } from "./useStoreResult";`, `import { useTeamProfileVersion } from "./useTeamProfile";`;
- after the `useState` hooks, add:

```tsx
    // The device's "Your team": a plan file has no team, so the preview shows this device's (spec R5).
    const loadProfile = useCallback(() => store.getTeamProfile(), [store]);
    const profile = useStoreResult(loadProfile, useTeamProfileVersion(store));
    const teamMark = profile.kind === "ready" && profile.data ? toTeamMark(profile.data, LOCAL_TEAM_ID) : null;
```

- change `<PlanPreview plan={state.plan} />` to `<PlanPreview plan={state.plan} teamMark={teamMark} />`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `rg -n "omitTeam|This device" components apps lib __tests__`
Expected: no output.

Run: `bun run test __tests__/components/features/practice-planner __tests__/apps/planner __tests__/app`
Expected: PASS.
- If the docx test's `descr` attribute text differs (the `docx` library's escaping), read the produced XML and pin exactly what it writes for `<`, `>` and the removed `\u0001`. The test must keep proving that markup is escaped and the control character is gone.
- If the EMU attribute pair differs, pin the produced values the same way.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 9: Screenshots and both exports**

With the static planner built and served as in Task 4 Step 9, write `<scratchpad>/pwcheck/logo-task6.mjs`:

```js
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const BASE = "http://localhost:4199/";
const ctx0 = await browser.newContext();
const setup = await ctx0.newPage();
setup.on("pageerror", (e) => console.log("pageerror", e.message));
await setup.goto(BASE + "#/import");
await setup.getByRole("button", { name: "Use template: Skills Stations" }).click();
await setup.getByRole("button", { name: /save to my practices/i }).click();
await setup.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
const session = setup.url();
async function team(withLogo) {
  await setup.getByRole("button", { name: "Your team" }).click();
  const dialog = setup.getByRole("dialog", { name: "Your team" });
  await dialog.getByRole("textbox", { name: "Team name" }).fill('Hawks <U12> & "Co"');
  if (withLogo) {
    const b64 = await setup.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 600; c.height = 240;
      const x = c.getContext("2d"); x.fillStyle = "#9B1B30"; x.fillRect(0, 0, 600, 240);
      x.fillStyle = "#fff"; x.font = "bold 120px sans-serif"; x.fillText("HAWKS", 40, 170);
      return c.toDataURL("image/png").split(",")[1];
    });
    await setup.locator('[data-testid="team-logo-input"]').setInputFiles({ name: "hawks.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
    await dialog.getByRole("button", { name: "Replace logo" }).waitFor();
  } else if (await dialog.getByRole("button", { name: "Remove logo" }).count()) {
    await dialog.getByRole("button", { name: "Remove logo" }).click();
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "detached" });
}
for (const withLogo of [false, true]) {
  const kind = withLogo ? "logo" : "crest";
  await team(withLogo);
  await setup.goto(session);
  await setup.getByRole("table", { name: "Session timeline" }).waitFor({ timeout: 20000 });
  for (const [item, file] of [["Download plan file", `logo-plan-${kind}.olplan.json`], ["Download bench sheet (HTML)", `logo-bench-${kind}.html`], ["Download Word document (.docx)", `logo-bench-${kind}.docx`]]) {
    await setup.getByRole("button", { name: "Export plan" }).click();
    const [download] = await Promise.all([setup.waitForEvent("download"), setup.getByRole("menuitem", { name: item }).click()]);
    await download.saveAs(file);
  }
}
await ctx0.close();
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE);
    await page.getByRole("button", { name: "Your team" }).click();
    await page.getByRole("textbox", { name: "Team name" }).fill("Ice Hawks");
    await page.getByRole("button", { name: "Save" }).click();
    await page.goto(BASE + "#/import");
    await page.locator('[data-testid="plan-file-input"]').setInputFiles("logo-plan-logo.olplan.json");
    await page.getByRole("heading", { level: 2 }).waitFor({ timeout: 20000 });
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.screenshot({ path: `logo-task6-preview-${tag}-${scheme}.png`, fullPage: true });
    for (const kind of ["crest", "logo"]) {
      await page.goto(pathToFileURL(`logo-bench-${kind}.html`).href);
      console.log(scheme, tag, kind, "html mark:", await page.locator("h1 img.mark").getAttribute("alt"));
      await page.screenshot({ path: `logo-task6-html-${kind}-${tag}-${scheme}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && node logo-task6.mjs && for k in crest logo; do unzip -l logo-bench-$k.docx | grep -c media/; unzip -p logo-bench-$k.docx word/document.xml | grep -o 'descr="[^"]*logo"' | head -1; grep -c 'data:image/png' logo-plan-$k.olplan.json; done` (with `CHROMIUM_PATH` set).
Expected output:
- no `pageerror`; overflow 0;
- "html mark: Hawks <U12> & "Co" logo" for both files;
- each `.docx` has at least one more `media/` entry than its diagrams need, and its `descr` reads `Hawks &lt;U12&gt; &amp; &quot;Co&quot; logo`;
- each plan file's `data:image/png` count equals its number of drills with thumbnails (the starter template's diagrams), never one more: the plan file carries no logo. Compare the crest and logo files: their counts are equal.

Read every `logo-task6-*.png`. Check all of these, then fix and re-run until they hold:
- The preview shows the device's Crest before the plan title.
- The HTML export shows the mark beside the title: the Crest (initials on the derived color) in one, the wordmark whole at 48 px high in the other.
- `<U12>` is text, not markup.

Open both `.docx` files in a Word-compatible viewer (Quick Look is enough) and check the mark sits at the start of the title line. Stop the preview server.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/bench-sheet-model.ts components/features/practice-planner/export/bench-sheet-html.ts \
  components/features/practice-planner/export/bench-sheet-docx.ts components/features/practice-planner/export/export-images.ts \
  components/features/practice-planner/export/export-bench-sheet.ts components/features/practice-planner/export/export-logo.ts \
  components/features/practice-planner/ExportPlanMenu.tsx components/features/practice-planner/PlanPreview.tsx \
  apps/planner/src/screens/ImportScreen.tsx \
  __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts \
  __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts __tests__/components/features/practice-planner/export/export-images.test.ts \
  __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx __tests__/components/features/practice-planner/PlanPreview.test.tsx \
  __tests__/apps/planner/import-screen.test.tsx
/usr/bin/git commit -m "feat(practice-planner): team mark in the bench sheet exports and the import preview" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Gates

Every repository gate, in CI order. Fix forward in the task that owns a failure; never skip a gate or weaken a test.

**Files:** none new. This task changes code only if a gate fails.

- [ ] **Step 1: Type-check and lint**

```bash
bun run type-check
bun run lint
```

Expected: both exit 0. A Zod v4 deprecation hint (★) in an IDE is not an error; the CLI result is what counts.

- [ ] **Step 2: Run the full suite**

Run: `bun run test`
Expected: PASS. If an unrelated test fails, check `gh run list --branch main --limit 5` first: a red `main` is not this branch's regression. A failure that names a date is clock rot; pin it with `vi.setSystemTime`, never by editing fixtures' dates.

- [ ] **Step 3: Build both deployables**

```bash
bun run build
bun run planner:build && bun run planner:check
```

Expected: both succeed.
- `next build` must not try to bundle `sharp` into a client chunk. If the build reports `sharp` or `child_process` in a client module, a portable file imports `lib/media/logo-image.ts`: find it with the Step 4 search and fix the import.
- `planner:check` must still pass (no Next.js runtime, no telemetry, `docx` lazy).

Then:

```bash
rg -l "sharp|libvips" dist/planner
```

Expected: no output. The static bundle never carries sharp.

- [ ] **Step 4: Check portability, palette tokens and the action's privacy**

```bash
rg -n 'from "next/|@/lib/actions|@/lib/db|@/lib/auth|@prisma/client|@/lib/media/blob|@/lib/media/logo-image|from "sharp"' \
  lib/media/logo-rules.ts lib/utils/team-mark.ts lib/utils/png-data-uri.ts lib/utils/practice-access.ts \
  lib/utils/canvas/crest-png.ts lib/utils/canvas/logo-file.ts \
  components/features/practice-planner/print/TeamMarkImage.tsx components/features/practice-planner/export/export-logo.ts \
  apps/planner/src/screens/YourTeam.tsx apps/planner/src/screens/useTeamProfile.ts apps/planner/src/store/team-profile.ts
rg -n '#[0-9A-Fa-f]{3,6}\b' apps/planner/src/screens/YourTeam.tsx components/features/practice-planner/print/TeamMarkImage.tsx
rg -n 'console\.(warn|error|log)' lib/actions/practice-logo.ts lib/media/logo-image.ts
rg -n 'import sharp|from "sharp"' lib app components apps
```

Expected:
- the first search prints nothing;
- the second prints only the color field's placeholder and default (`#0D47A1` / `#0d47a1`, data, not styling);
- the third prints the three `console.warn` lines in `practice-logo.ts`: two fixed messages and one that logs `error.name` only;
- the fourth prints nothing (sharp is loaded only through `await import("sharp")` in `lib/media/logo-image.ts`).

- [ ] **Step 5: Run the ADR and SQL policy checks**

```bash
bun run adr:lint
bun run adr:check-integrity
bun run check:raw-sql
bun run adr:check lib/actions/practice-logo.ts lib/media/logo-image.ts lib/actions/practice-session-queries.ts \
  apps/planner/src/store/records.ts apps/planner/src/store/team-profile.ts components/features/practice-planner/ExportPlanMenu.tsx package.json
```

Expected:
- the first three exit 0;
- `adr:check` lists ADR-0002 (Server Actions: the new read is a server action), ADR-0003 (Prisma only: no raw SQL added), ADR-0004 (MUI) and ADR-0020 (static planner) as governing, with no violation.

ADR-0020 needs no amendment. The plan document format is unchanged, and the profile is one more device-level meta record that never leaves the browser, which ADR-0020's local-first store already covers. If `adr:check` names another ADR that this change contradicts, stop and report instead of editing the ADR.

- [ ] **Step 6: Check the line budgets, the lockfile and the working tree**

```bash
wc -l components/features/practice-planner/PracticeSessionEditor.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"
/usr/bin/git diff main -- bun.lock | rg '^\+' | rg -v '^\+\+\+' | head
/usr/bin/git diff main --name-only | xargs rg -n '/Use[r]s/|/priv[a]te/tmp|scratchpad/|claude-[0-9]{3}' || true
/usr/bin/git status --short
```

Expected:
- the editor is 806 lines (untouched) and the session page about 750 (both ≤ 900);
- `bun.lock`'s added lines are only the root's `"sharp": "^0.35.4"`;
- no local path in any changed file;
- `git status` shows nothing. If `CLAUDE.md` appears modified by `next dev`, leave it out of every commit.

- [ ] **Step 7: Final screenshots for the PR**

With the static planner served as in Task 4 Step 9, re-run `logo-task4.mjs`, `logo-task5.mjs` and `logo-task6.mjs` against the final build, and read every PNG once more. That covers the Your team dialog, the session header with the Crest and with a logo, the printed bench sheet, the import preview and both exports, light and dark, desktop and mobile (spec "Visual"). Stop the preview server.

- [ ] **Step 8: Commit any gate fixes**

Only if Steps 1–7 required changes. Stage the exact files by path:

```bash
/usr/bin/git add <the files you changed>
/usr/bin/git commit -m "fix(practice-planner): <what the gate caught>" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| Goal: mark on the session page header, live and printed bench sheet, HTML and Word exports, static import preview | 5 (header, bench sheet), 6 (exports, preview) |
| Success 1: hosted logo or Crest everywhere | 2 (detail read `teamMark`, action), 5, 6 |
| Success 2: static Your team dialog (name, logo upload/remove, two colors), stored in this browser; exports print the team name | 3 (store), 4 (dialog), 5/6 (name and mark printed) |
| Success 3: Crest with no logo; nothing with no static name | 1 (`crestPng`), 5 (`TeamMarkImage`, header), 6 (model fallback), 3 (no profile → `""`, no mark) |
| Success 4: exports self-contained, PNG data only, no fetch from the file | 6 (`isPngDataUri` on every mark; `EXPORT_CSP` unchanged, tested) |
| Success 5: a failed logo falls back; an export never fails because of a logo | 2 (action → null), 5 (`onError`), 6 (`resolveExportLogo`, the menu tests for null and rejection) |
| R1 server action: `idSchema` id, sweep entry, the detail read's authorization, owned URL only, 5 s timeout, 2 MB cap, magic-byte sniff, 512 PNG, `{ dataUrl, width, height } \| null`, null on failure | 2 |
| R1 image library choice, justified; no native-only library Vercel can't build | Global Constraints, 2 Step 1 |
| R2 one normalized shape; exports draw about 48 px high, ratio kept | 1 (`isLogoImage`, `exportMarkSize`), 2 (server), 4 (browser), 6 (sizes) |
| R3 `crestPng` (in `lib/utils/canvas/crest-png.ts`) with `crestInitials`, `resolveCrestColor`, the Crest's font, in a circle; both apps | 1, 5, 6 |
| R4 storage under `META_TEAM_PROFILE` (no IndexedDB bump), legacy devices, upload rules (types, 2 MB, 512 → 256 → refuse at 200 KB), name 1–60 cleaned like staff names, `#RRGGBB` colors, where it shows, never in plan files, import leaves it unchanged | 1 (rules), 3 (store), 4 (upload, dialog), 6 (preview, plan file check) |
| R5 header Crest md (hosted and static), bench sheet mark beside the title, HTML `<img>` with escaped alt, Word inline image with `xmlSafe` alt, static import preview mark | 5, 6 |
| R6 failures logged without URLs or ids; the URL never returned; logos are public branding | 2 (log and return tests), 4 (upload log), 6 (`resolveExportLogo` log) |
| Testing: server action (auth, id, sweep, owned, sniff, oversize, timeout, valid PNG/JPEG/WebP) | 2 |
| Testing: image normalization (ratio, downscale, static cap and re-encode, SVG refused) | 1, 2, 4 |
| Testing: `crestPng` with the canvas mocking pattern | 1 |
| Testing: static store, both repos (set, get, clear, validation, legacy device) | 3 |
| Testing: bench sheet model, HTML and Word (logo, Crest, no team, escaping, CSP unchanged) | 6 |
| Testing: components (the dialog's upload, remove and color fields at 44 px; the header mark in both apps) | 4, 5 |
| Testing: visual, light and dark, desktop and mobile; open both exports with a logo and with the Crest | 4, 5, 6, 7 |
| Out of scope (league and venue logos, hosted upload flow, syncing the profile, emails) | not touched. `lib/media/blob.ts` only re-exports moved constants; the upload route and `LogoUploader` are unchanged |

**Spec gaps and conflicts, and how this plan resolves them:**
- **Image library (R1):**
  - `sharp` is the library; it is promoted from Next's optional dependency to a direct one at the locked version (evidence in Global Constraints).
  - It loads through `await import("sharp")` in one server module, so the many jsdom tests that import `lib/actions` never load a native binary. The tests that run sharp opt into the node environment.
  - What can't be checked from a workstation is the Vercel runtime itself. The evidence offered is Next's server-external list and the Linux prebuilt binaries in the lockfile, the same sharp Next's own image optimizer uses.
- **"Any failure → null" versus the detail read's redirect:** the detail read uses `requireUserId`, which redirects a signed-out visitor. The action uses `getCurrentUserId` and returns `null`, so a logo can never navigate an export away. Who may read is identical, through the shared `canViewPracticeSession`, which the detail read now uses too.
- **Crest ink:** R3 says "white initials", but the on-screen Crest measures its ink (`contrastTextFor`) and uses black on a light brand color. `crestPng` follows the on-screen Crest, as R3 also requires ("the same rules … as the on-screen Crest"). That is white for every palette color, and black only where white would be unreadable.
- **Hosted logo size:** R4's 200 KB rule is written for static uploads. Applying it on the server as well (512 → 256 → null, then the Crest) gives R2's "one normalized image shape" a bound in both apps and keeps every export small.
- **Static team name:** the "This device" leave-out rule is removed (BenchSheet, ExportPlanMenu, the model's `omitTeam`). A static view's `teamName` is the profile's name or `""`, and blank names already print nothing.
- **Seam:** `getPracticeLogoImage` is optional on `PlannerStore` (hosted only), like `sharePracticeSession`. The static profile's logo travels in `TeamMark.logoImage`, so static exports make no store call.
- **Live refresh:** the static profile lives in the meta store, but the session page shows it without a reload. The store notifies subscribers in this tab, and screens pass `useTeamProfileVersion` as `useStoreResult`'s refresh key. Another tab picks the change up on its next load (accepted).
- **Session page versus print:** on screen the mark is the CSS `Crest` (R1: "renders the logo with the existing Crest component, from the URL"). The bench sheet uses an `<img>` (`TeamMarkImage`), because print drops CSS backgrounds.
- **Secondary color:** R4 stores it, but no surface in this spec draws one: it is kept in the profile for later use and shown only in the dialog.
- **Color format:** static accepts `#RRGGBB` only (spec R4), while hosted branding also accepts `#RGB`. The message text is hosted's, so both read the same.

**Placeholder scan:** none. Every code step carries the code, and steps that edit large existing files name the block and show the new lines. The only `<…>` text is the gate-fix commit template in Task 7 and the screenshot commands' `<scratchpad>`, which stands for this machine's scratch folder and is kept out of the repository on purpose. `CHROMIUM_PATH` is read from the environment.

**Type consistency:**
- `LogoImage`, `TeamMark`, `TeamProfile` (Task 1) are the shapes used by the action (Task 2), the store (Task 3), the dialog (Task 4), `TeamMarkImage` (Task 5) and the model (Task 6).
- `TeamProfileInput` (Task 1) is what `saveTeamProfile` takes (Task 3) and what the dialog builds (Task 4).
- `toTeamMark(profile, LOCAL_TEAM_ID)` builds the static mark in `getSessionView` (Task 3) and `ImportScreen` (Task 6). The detail read builds the hosted mark without `logoImage` (Task 2), which is what makes `resolveExportLogo` call `getPracticeLogoImage` (Task 6).
- `PlannerStore.getPracticeLogoImage?: (sessionId: string) => Promise<LogoImage | null>` (Task 2) matches the action's signature (`hostedPlannerStore` type-checks it) and `resolveExportLogo`'s `fetchLogo` parameter (Task 6).
- `BenchSheetRenderers.crest(name, color)` (Task 6) is implemented by `canvasRenderers.crest` through `crestPng({ name, color, size: CREST_EXPORT_PX })` (Task 1).
- `useStoreResult(load, refreshKey)` and `useTeamProfileVersion(store)` (Task 4) are used by `SessionDetailScreen`, `BenchSheetScreen`, `YourTeamButton` (Task 4) and `ImportScreen` (Task 6).

**Review Focus coverage:**

| Review Focus item | Tasks with its tests |
|---|---|
| 1. A logo that can't be had | 2, 5, 6 |
| 2. Extreme aspect ratios | 1, 2, 6 |
| 3. Hostile names | 1, 6 |
| 4. Disguised or oversize uploads | 1, 2, 4 |
| 5. The profile changing under an open practice | 3, 4, 5 |
