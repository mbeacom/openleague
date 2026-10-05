# Team Logo on Practices — Design

**Date:** 2026-10-05
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-05-practice-logo.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** Crest branding (team `logoUrl`, `brandPrimaryColor`, `brandSecondaryColor`; `lib/utils/crest.ts`; `components/ui/Crest.tsx`), the bench sheet and its HTML/Word exports, the static planner store (ADR-0020).

## Context

What exists (verified):
- **Hosted logo.** A team already has `logoUrl`, uploaded through `components/ui/LogoUploader.tsx` and `lib/actions/branding.ts`.
  - It is stored in Vercel Blob under `entityLogoPrefix("team", teamId)`.
  - `isOwnedBlobUrl` checks that a URL is ours.
  - Logos are PNG, JPEG or WebP (`LOGO_CONTENT_TYPES`), up to 2 MB. SVG is refused as a script vector.
- **Crest.** The Crest identity system draws the logo, or the team's initials (`crestInitials`) on its brand colour (`resolveCrestColor`, falling back to `crestColorForId`).
- **Session page.** The page shows the team name without a mark.
- **Bench sheet.** The bench sheet (`print/BenchSheet.tsx`) and its exports (`export/bench-sheet-{model,html,docx}.ts`) embed images as PNG data. The HTML export is one self-contained file with a CSP that allows only `data:` images.
- **Static planner.** The static planner has no team. Its exports and print view leave out the placeholder name "This device".

## Goal

Practices carry the team's identity: its logo, or a Crest when there is none. The mark appears on:
- the session page header;
- the live and printed bench sheet;
- the HTML and Word exports;
- the static import preview.

In the static planner, the coach sets a device-wide **Your team** profile (name, logo, colours). Plan files never carry the logo.

### Success criteria

1. **Hosted:** every practice of a team shows its logo, or its Crest when there is no logo. This holds on the session page, the bench sheet (screen and print), and the HTML and Word exports.
2. **Static:** a **Your team** dialog sets the team name, a logo (upload or remove) and two optional colours, stored in this browser. Every practice on the device then shows that mark. Exports print the team name where "This device" used to be left out.
3. **No logo:** the Crest is shown everywhere, as the initials on the team colour. With no static team name set, nothing is shown, as today.
4. **Exports stay self-contained.** The logo is embedded as PNG data, and no network fetch happens from an exported file.
5. **Failure is safe.** A logo that can't be fetched or decoded falls back to the Crest, and an export never fails because of a logo.

## Rulings

### R1. Hosted export logo comes from a server action

`getPracticeLogoImage(sessionId)` is a server action. Its id is validated with `idSchema`, it goes in the action sweep table, and it is authorized exactly like the session detail read, through the same shared rule: the team's admins always, and the team's members only once the practice is shared. Anyone else (a member of an unshared practice, someone outside the team, a signed-out caller) gets `null`.

- It looks up the team's `logoUrl` and refuses anything that isn't `isOwnedBlobUrl(url, entityLogoPrefix("team", teamId))`.
- It fetches the logo server-side with a 5 s timeout and a 2 MB cap.
- It checks the content type is one of `LOGO_CONTENT_TYPES` by sniffing the magic bytes, not by trusting the header.
- It resizes the image to fit 512×512, encodes it as PNG, and returns `{ dataUrl, width, height } | null`.
- Any failure returns `null`, and the client falls back to the Crest.

**Image processing.** The plan picks the server-side image library. Prefer one already in `package.json`; a new dependency must be justified in the plan, and none may be native-only if Vercel can't build it.

**Why server-side:** a browser fetch would depend on Blob CORS and on loosening the hosted CSP `connect-src`. It would also let the client name the URL. The session page itself renders the logo with the existing `Crest` component, from the URL as it does today.

### R2. One normalized image shape

Every logo used in a bench sheet or export is a PNG data URL that fits 512×512: hosted logos come from R1 and static logos from R4. Exports draw it at about 48 px high in the HTML and Word headers, keeping its aspect ratio.

### R3. Crest fallback in print and exports

`crestPng({ name, color, size })` draws the Crest to a canvas, returning a PNG data URL. The plan decides whether it lives in the shared export images module (`export/export-images.ts`) or a new `lib/utils/canvas/crest-png.ts`. It uses the same `crestInitials` / `resolveCrestColor` rules and font as the on-screen Crest, white initials on the colour, in a circle. Both apps use it for the bench sheet and exports when there's no logo.

### R4. Static "Your team" profile

**Storage.** A device-level record holds `{ name: string; logo: { dataUrl, width, height } | null; primaryColor: string | null; secondaryColor: string | null }`. It lives in the planner's meta store under one new key, `META_TEAM_PROFILE`, so no IndexedDB version bump is needed. Older devices have no profile, which means no mark and no name, as today.

**Upload.**
- Accepts PNG, JPEG or WebP (SVG refused, matching hosted), up to 2 MB raw.
- The image is decoded with `createImageBitmap`, resized to fit 512×512 on a canvas, and stored as PNG.
- If the PNG is over 200 KB, it is re-encoded at 256 px. If it's still over 200 KB, the upload is refused with a plain message.

**Fields.**
- Name: trimmed, 1–60 characters, control characters stripped. It uses the same name cleaning as staff names, without the uniqueness rule.
- Colours: hex `#RRGGBB`.

**Where it shows.** The profile appears on the static session page, bench sheet, exports and import preview.
- **Bench sheet and exports:** the team name replaces the current leave-out-"This device" rule.
- **Plan files:** never carry the profile. Importing a file doesn't change it, and exporting doesn't include it.

### R5. Where the mark appears

**Session page header.** The team mark appears before the title, at Crest `md` size:
- hosted: `Crest` from team data;
- static: `Crest` from the profile.

**Bench sheet** (live and print). A small mark sits beside the title, with the team name line below, as now.

**HTML export.** An `<img>` with a `data:` URL sits in the header (the CSP already allows `data:` images). It has alt text `"<team> logo"`, escaped.

**Word export.** The image sits inline at the start of the header block. Alt text goes through `xmlSafe`.

**Static import preview.** It shows the device profile's mark, because the plan file has none.

### R6. Errors and privacy

- Logo fetch and decode failures are logged without URLs or ids, and the Crest is used instead.
- The action never returns the blob URL, only the PNG data.
- Logos are already public team branding, so embedding them in exports is no change in exposure.

## Testing

- **Server action:**
  - authentication and authorization (no access under the detail read's rule, such as a member of an unshared practice or someone outside the team: `null`);
  - id validation, plus a sweep-table entry;
  - a non-owned URL is refused;
  - a non-image (sniffed) is refused;
  - an oversize image is refused;
  - a timeout gives `null`;
  - a valid PNG, JPEG or WebP gives a ≤512 PNG data URL.
- **Image normalization:** aspect ratio kept; a large image is downscaled; the static upload cap and re-encode path; SVG is refused.
- **`crestPng`:** initials and colour follow `lib/utils/crest.ts`; the output is a deterministic PNG data URL in jsdom, using the existing canvas mocking pattern.
- **Static store (both repos):** profile set, get and clear; validation; a legacy device with no profile.
- **Bench sheet model, HTML and Word:**
  - with a logo;
  - with the Crest fallback;
  - with no team (static, no profile);
  - escaping of name and alt text;
  - the HTML CSP is unchanged.
- **Components:**
  - the Your team dialog: upload, remove and the colour fields, with 44px targets;
  - the session header mark in both apps.
- **Visual:** light and dark screenshots on desktop and mobile of the session header, the Your team dialog, and the bench sheet (screen and print/PDF). Also open the HTML and Word exports with a logo and with the Crest.

## Out of scope

- Logos for leagues or venues on practices.
- Changing the hosted logo upload flow.
- Syncing the static profile to hosted, or carrying it in plan files.
- Logos in emails.
