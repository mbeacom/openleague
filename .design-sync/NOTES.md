# design-sync notes — OpenLeague

## What this repo is (read first)
OpenLeague is a **Next.js app, not a packaged component library** — no `dist/`, no
`package.json` `exports`. The sync runs the **package shape in a synthesized/source
mode**: the bundle is built directly from `.tsx` sources via a custom aggregate
entry, with `@/` and `next/*` resolved by a dedicated tsconfig.

## Re-sync command
```sh
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules \
  --entry ./.design-sync/entry.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
- **`--entry ./.design-sync/entry.ts` is required** — it's the aggregate entry that
  re-exports the `components/ui` primitives + the scoped feature components onto
  `window.OpenLeague`. Without it, PKG_DIR resolves to the non-existent
  `node_modules/openleague` and the build fails.
- `--node-modules ./node_modules` (repo root — react/MUI resolve there).
- Fetch the project's `_ds_sync.json` → `.design-sync/.cache/remote-sync.json` first.

## Key mechanics / gotchas
- **tsconfig `.design-sync/tsconfig.ds.json`**: `baseUrl: ".."` (repo root). Order
  matters — the specific `@/lib/...` stub rules MUST come **before** the `@/*`
  wildcard, or the wildcard shadows them and the real server-action modules get
  bundled (pulls in the whole Next server runtime → `@opentelemetry/api` build error).
- **Shims** (`.design-sync/shims/`): `next-link` → `<a>`, `next-image` → `<img>`,
  `next-navigation` → inert `useRouter/usePathname/...`, `actions-stub` (roster/rsvp
  server actions → no-ops), `analytics-stub` (umami → no-ops). Add a named export to
  `actions-stub.ts`/`analytics-stub.ts` for each new action a newly-scoped component
  imports, and map the module in the tsconfig paths (before `@/*`).
- **`.d.ts` extraction is empty for these sources** (ts-morph reads the wrong tree in
  synth mode) — every component's props are hand-written in `cfg.dtsPropsFor`. Keep it
  in sync when a component's real props change.
- **Baked logo assets** (`.design-sync/assets/logo-icon.png`, `brand-logo-full.png`):
  downscaled from `public/images/` with macOS `sips`. `next-image` maps the hardcoded
  `/images/*.webp|png` paths to these data-URIs so Logo/BrandLogo render the real mark.
  If the brand logo changes, regenerate: `sips -s format png -Z 200 public/images/logo.webp --out .design-sync/assets/logo-icon.png`
  and `sips -s format png -Z 320 public/images/alt-logo-transparent-background.png --out .design-sync/assets/brand-logo-full.png`.
- **Fonts**: Cabinet Grotesk loads at runtime from Fontshare via the `@import` in
  `app/globals.css` (folded into `_ds_bundle.css`, in the `styles.css` closure).
  Classified `cfg.runtimeFontPrefixes: ["Cabinet Grotesk"]` — no local woff2 ships.
- **Grouping** comes from the source subdirectory (roster/venues/events/calendar/
  dashboard; primitives → general), NOT the doc `category` frontmatter. The
  `.design-sync/docs/<Name>.md` files serve as the feature components' `.prompt.md`.
- **`guidelinesGlob: []`** — the repo's `docs/*.md` are engineering docs, not design
  guidance; shipping none.

## Adding a component
1. Add its export to `.design-sync/entry.ts` (so it lands on the global).
2. Pin `componentSrcMap.<Name>` to its `.tsx`; add `dtsPropsFor.<Name>`.
3. If it imports server actions/analytics not yet stubbed, extend the stubs + tsconfig.
4. Author `.design-sync/previews/<Name>.tsx`; optionally `.design-sync/docs/<Name>.md`
   for a richer prompt.
5. Overlay/wide components → `cfg.overrides.<Name>` (`cardMode: single|column`).

## Known render warns
None — validate exits clean (0 warnings) at time of last sync.

## Re-sync risks (what can silently go stale)
- **Preview mock props** are inlined literals tied to the components' current prop
  shapes. If a component's props change upstream, its preview may render wrong or its
  `dtsPropsFor` body may drift from reality — re-verify the changed component's card.
- **Action/analytics stubs** must keep pace with imports; a new action import that
  isn't stubbed reintroduces the `@opentelemetry/api` build failure.
- **Fontshare reachability**: the brand font depends on api.fontshare.com being
  reachable from the design render environment. If it's blocked, cards fall back to
  system fonts — consider shipping a self-hosted woff2 via `cfg.extraFonts` if that
  becomes a problem.
- **Baked logos** are a point-in-time snapshot of `public/images/`; regenerate if the
  brand art changes.
- The bundle inlines MUI (~1.9 MB) — expected for a CSS-in-JS DS.
