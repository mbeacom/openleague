# Practice video links: design

Date: 2026-10-11
Status: proposed
Governing decisions: ADR-0002 (server actions), ADR-0003 (Prisma only), ADR-0008 (free, provider-portable core; optional seams), ADR-0020 (portable plan document, additive amendments), ADR-0022 (envelope and client-only storage; no backend for the static app)

## Context

Coaches already teach drills with video: a demonstration clip from a coaching
channel, a skills video from the association, or footage the coach shot at last
week's practice and keeps in their own cloud storage. Today a coach can only
paste such a link into a drill's description or a row's instructions, where it
is plain text: not clickable in most views, not validated, and indistinguishable
from the rest of the note.

The practice planner runs in two places that share components and the plan
document: the hosted app and the static planner at `openleague.dev/planner/`
(`apps/planner`). What exists today, and what constrains this feature:

- **Drill data.** `PlayData` (`types/practice-planner.ts:283-293`) is the drill's
  diagram plus advisory extras: `area?` and `equipmentNeeds?`. Hosted stores it
  as `Play.playData Json` (`prisma/schema.prisma:1820`); the static app stores
  it in IndexedDB (`apps/planner/src/store/idb-repo.ts:27`, `DB_VERSION = 7`).
  The practice equipment work put `equipmentNeeds` inside `PlayData` precisely
  "so it rides every drill save, copy and plan file" (`types/practice-planner.ts`,
  `EquipmentNeeds` doc comment), with a lenient read that drops an unreadable
  list instead of making the drill unreadable
  (`lib/utils/play-data.ts:241-250`) and a normalizing write path
  (`lib/utils/play-data.ts:349`).
- **Session data.** `PracticeSession` carries its own JSON list,
  `equipment Json @default("[]")` (`prisma/schema.prisma:1637`), validated by a
  Zod schema on every write. That is the precedent for a small, per-practice
  list with no query needs.
- **Plan document.** `lib/plan-document/document.ts` caps a file at
  `MAX_PLAN_FILE_BYTES = 900_000` and a share link at
  `MAX_PLAN_LINK_BYTES = 65_536` (l.50-51). Parsing strips unknown keys (l.6);
  each drill's diagram goes through `parseStoredPlayData` (l.124-129), whose
  `playDataSchema` is a plain `z.object` (`lib/utils/play-data.ts:101-115`), so
  an unknown `PlayData` key is stripped too. ADR-0020's amendments (l.166-181)
  set the pattern for additive fields: no version bump, readers default missing
  values, writers always emit, older readers drop the new keys.
- **Hosted CSP.** `next.config.ts` sets `frame-src 'self'` only (l.43-45,
  emitted at l.161) and a page-wide `Referrer-Policy: strict-origin-when-cross-origin`
  (l.141-142).
- **Static CSP.** `plannerCsp` in `apps/planner/build-config.ts:34-48` sets
  `default-src 'self'` and no `frame-src`, so frames fall back to `'self'`.
  `apps/planner/index.html:7` sets `<meta name="referrer" content="no-referrer">`
  for the whole app. There is no separate cloud CSP module on `main` yet; the
  storage connectors spec notes that any explicit `frame-src` must keep `'self'`
  (`docs/superpowers/specs/2026-10-07-static-storage-connectors-design.md:318`),
  and ADR-0022 (l.78) widens the CSP only for a configured provider.
- **Media storage.** `lib/media/blob.ts:12-16` stores uploads web-accessible
  under unguessable paths; authorization is enforced on the gallery listing, not
  on the file URL. Blob is not private storage.
- **No backend for the static app** (ADR-0022): nothing may resolve, proxy or
  check a link server-side for it.
- **AI drafts** start from an empty diagram
  (`lib/ai/tasks/notes-to-plan.ts:74-75, 135`), so they carry no videos today.

## Goal

A coach can attach a few video links to a drill, and optionally to a practice,
and every viewer of that drill or practice can watch them in one or two taps,
on the hosted app and on the static planner, with the same components. Links
survive save, copy, plan file and share link. No video is uploaded, and no
third-party request is made until a viewer asks to watch.

### Success criteria

1. A drill holds 0 to 5 video links; a practice holds 0 to 5 of its own.
2. Pasting a YouTube, Vimeo, Google Drive or OneDrive link is recognized and
   normalized; any other `https` link is accepted as a plain link; anything
   else is refused with a clear message.
3. Viewing a drill or practice makes no request to any video provider until the
   viewer activates a video.
4. A drill's videos round-trip through hosted save, library copy, session-owned
   copy, duplicate session, plan file, share link and static IndexedDB, and an
   older reader opens the same file with the videos dropped and nothing else lost.
5. The bench sheet, HTML and Word exports list each drill's videos.
6. Every video control is reachable and operable by keyboard and has an
   accessible name.

## Rulings

### R1. Links only, never uploads

The planner stores links to videos the coach already hosts elsewhere. It never
uploads, transcodes, proxies or caches video.

- Practice footage usually shows minors. A link leaves the video in the coach's
  own account, under that provider's sharing controls, where the coach can
  revoke it.
- Blob storage is web-accessible by unguessable path (`lib/media/blob.ts:12-16`),
  not private, and the static app has no backend to upload to (ADR-0022).
- ADR-0008: video hosting becomes an optional, provider-portable reference, not
  a storage provider the core depends on. A self-hosted deployment needs no new
  configuration.

The editor carries one line of guidance under the field: "Link to videos you're
allowed to share. Anyone who opens this plan can follow the link."

### R2. Data shape

```ts
export const VIDEO_PROVIDERS = ["youtube", "vimeo", "drive", "onedrive", "link"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export interface VideoLink {
    /** Normalized https URL (R3). The only field a reader must trust. */
    url: string;
    /** Derived from url on every read and write; stored for readers that only display. */
    provider: VideoProvider;
    /** Whole seconds from 0 to 86_399; YouTube and Vimeo only. Absent = from the start. */
    startSec?: number;
    /** 1-80 characters once cleaned (control characters removed, whitespace collapsed). */
    title?: string;
}

export const MAX_DRILL_VIDEOS = 5;
export const MAX_SESSION_VIDEOS = 5;
export const VIDEO_TITLE_MAX = 80;
export const VIDEO_URL_MAX = 500;
```

- **Drill:** `PlayData.videos?: VideoLink[]`. Absent and `[]` mean none; writers
  omit the key when empty, as with `equipmentNeeds`.
- **Practice:** a list of the same shape (R6).
- Embed HTML, iframe attributes, thumbnails and provider metadata (titles,
  durations) are never stored. The title is the coach's own text.
- Five per drill is a teaching aid, not a playlist. At most about 600 bytes per
  link, 50 drills times 5 links is about 150 KB in the worst case. That fits the
  900 KB file limit. A share link near 64 KB already fails for large diagrams,
  and the existing over-limit message covers it.

### R3. Normalization and the provider allowlist

One pure module, `lib/utils/video-links.ts`, shared by hosted, static, the plan
document and the editor. It exports `parseVideoUrl(raw) → { ok, link } | { ok: false, message }`
and the Zod schema built on it. Every write path and every read path runs it.
A stored `provider` that disagrees with the URL is silently corrected, never
trusted.

Common rules:
- `https:` only. `http:`, `javascript:`, `data:`, `blob:`, `file:` and
  protocol-relative input are refused ("Use an https link").
- A URL with credentials (`user:pass@`), a non-default port or an IP-literal
  host is refused. The URL is at most 500 characters after normalization.
- The host is lowercased, the fragment is dropped (except where a provider needs
  it, none today), and known tracking parameters (`si`, `feature`, `pp`,
  `utm_*`) are removed.

| Provider | Accepted hosts | Accepted forms | Stored as |
|---|---|---|---|
| `youtube` | `youtube.com`, `www.`, `m.`, `music.` hosts, `youtu.be`, `www.youtube-nocookie.com` | `/watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/live/ID`, `/embed/ID`; `t=` / `start=` as seconds or `1m30s` | `https://www.youtube.com/watch?v=ID`, start moved to `startSec` |
| `vimeo` | `vimeo.com`, `www.vimeo.com`, `player.vimeo.com` | `vimeo.com/ID`, `vimeo.com/ID/HASH`, `player.vimeo.com/video/ID?h=HASH`; `#t=1m30s` | `https://vimeo.com/ID` or `https://vimeo.com/ID/HASH` |
| `drive` | `drive.google.com` | `/file/d/FILE_ID/...`, `/open?id=FILE_ID` | `https://drive.google.com/file/d/FILE_ID/view` (a `resourcekey` query parameter is kept) |
| `onedrive` | `onedrive.live.com`, `1drv.ms`, `*.sharepoint.com` | any share link | the URL as given, minus tracking parameters |
| `link` | any other public host | any path | the URL as given, minus tracking parameters |

- A YouTube ID is exactly 11 characters of `[A-Za-z0-9_-]`; a Vimeo ID is
  digits and a hash is hexadecimal. A recognized host with an unrecognized path
  ("That YouTube link doesn't point to a video") is refused rather than kept as
  a plain link, so a channel or playlist URL is not mistaken for a drill video.
- Vimeo unlisted videos need their hash, or the player reports that the video
  does not exist. The hash is kept in the stored URL and passed as `h=` to the
  player (R5).
- `startSec` is dropped for `drive`, `onedrive` and `link`.
- Normalization is idempotent for the fields derived from the URL:
  `parseVideoUrl(parseVideoUrl(x).link.url)` yields the same `url` and
  `provider`. The start time is not: parsing moves `t=` or `#t=` out of the URL
  into `startSec`, so a reparse of the stored URL alone finds no start. Reading or
  writing a stored link therefore takes the start from its `startSec` field, and
  only falls back to a start found in the URL when that field is absent. A stored
  `{ url, startSec: 90 }` reads and writes back with `startSec: 90`. Tests pin
  both rules.
- On read, an unparseable entry is dropped and logged, and the remaining links
  are kept, the same lenient rule as `readableEquipmentNeeds`. Videos are
  advisory and never make a drill or plan unreadable. On write, an invalid entry
  is a field error.

### R4. Click-to-load facade, never a pre-click request

Every place that shows videos renders `VideoLinkList`, a shared component in
`components/features/practice-planner/`. Each link is a card with:

- a local provider icon (MUI outline icons; no thumbnail from `i.ytimg.com`,
  `vumbnail` or any other host);
- the coach's title, else "YouTube video", "Vimeo video", "Google Drive video",
  "OneDrive video" or "Video link";
- the host in small text (`youtube.com`, `drive.google.com`, `example.org`), so
  the destination of a link in an imported plan is always visible;
- "from 1:30" when `startSec` is set;
- an **Open** action: a real `<a href target="_blank" rel="noopener noreferrer">`,
  available for every provider, with `startSec` applied (`&t=90` on YouTube,
  `#t=90s` on Vimeo);
- for `youtube` and `vimeo` only, once phase 2 ships, a **Play here** action
  that swaps the card for an inline player (R5).

Rendering the card makes no network request. Opening a watch page in a new tab
sends no referrer and needs no CSP change. Drive, OneDrive and plain links
always open as links: their preview frames depend on the file's sharing setting
and the viewer's sign-in, which the planner cannot know or check without a
backend.

### R5. The inline player (phase 2)

**Sources.** YouTube plays from
`https://www.youtube-nocookie.com/embed/ID?start=S&rel=0`. Vimeo plays from
`https://player.vimeo.com/video/ID?h=HASH&dnt=1`, with `#t=Ss` for a start
time. `dnt=1` is described in third-party references; confirm it against
Vimeo's own player parameter documentation during implementation and drop it if
it is not documented. YouTube's privacy-enhanced host does not stop YouTube
storing data once the viewer presses play. The guarantee this design makes is
the facade's: nothing loads before the click.

**CSP.** Both policies widen by exactly two origins:
- hosted (`next.config.ts`): `frameSrc` becomes
  `["'self'", "https://www.youtube-nocookie.com", "https://player.vimeo.com"]`;
- static (`plannerCsp`): a new explicit
  `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com`.
  `'self'` is required: setting `frame-src` ends the fallback to `default-src`,
  and the storage connectors' MSAL iframe ends on the planner's own origin. When
  the connectors add their hosts, they append to this one list.

No `script-src`, `connect-src` or `img-src` change: the planner never loads the
YouTube IFrame API or Vimeo's player SDK and never talks to the frame by
`postMessage`.

**Referrer.** YouTube requires embedded players to identify the embedding site
through the HTTP `Referer` header, recommends `strict-origin-when-cross-origin`,
and reports error 153 when the header is missing (R13 records the sources). The
static app's `<meta name="referrer" content="no-referrer">` would strip it. So
the iframe carries its own `referrerpolicy="strict-origin-when-cross-origin"`.
An element's `referrerpolicy` attribute governs that request in place of the
document's policy, so the page-wide no-referrer stays in place for every other
request. The value sends only the origin (`https://openleague.dev/`) cross-site,
never a path. The static app's hash routes never reach a server in any case. The
hosted page policy already matches, and the attribute is set there too so both
builds behave the same.

**Frame attributes.** `title="Video: <title or fallback>"`,
`allow="fullscreen; picture-in-picture; encrypted-media"`, `allowfullscreen`,
and `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`.
The frame is cross-origin, so `allow-same-origin` grants it nothing on our
origin. If either player fails under the sandbox in implementation testing, the
sandbox is dropped for that provider and the reason is recorded in a comment.

**Size.** YouTube requires an embedded viewport of at least 200 by 200 pixels
and recommends 480 by 270 or more for 16:9. At a 360 px phone width less the 16
px gutters, a 16:9 frame would be 185 px tall, so the frame is
`width: 100%; aspect-ratio: 16/9; min-height: 200px`.

**Failure.** Without the player API, the page cannot read the player's error
(private video, embedding disabled, domain-restricted Vimeo). The **Open**
link therefore stays visible under the player, and the player has a **Close**
button that restores the card. Only one inline player plays at a time: opening
a second closes the first.

### R6. Where videos live in storage

**Drill videos ride inside `PlayData`** (`playData.videos`), like
`equipmentNeeds`:

- Hosted needs no migration for drills: `Play.playData` is already `Json`. Every
  copy path (library to session-owned copy, starter to library, duplicate
  session, plan import) already copies `playData` whole, so no path can forget
  the field.
- `playDataSchema` gains `videos: videoLinksSchema(MAX_DRILL_VIDEOS).optional()`;
  `upgradePlayData` gains a `readableVideos` step beside `readableEquipmentNeeds`;
  `sanitizePlayDataForWrite` normalizes and omits an empty list.
- The element-count refine and thumbnail generation ignore videos.
  `PLAY_DATA_VERSION` stays 2.
- Static: the field is additive, but `DB_VERSION` still goes to the next free
  number, with an upgrade case that writes nothing. A tab still running an older
  build would otherwise read a drill through its old schema and save it back
  without `videos`; the bump makes that tab reload (`onversionchange`) first,
  the same rule ADR-0020 applied to age groups and area.
- Rejected: a sibling `Play.videos` column and `drill.videos` document field.
  These would be semantically tidier, but every copy, import, export and static
  store path would have to carry a new field by hand. The equipment work chose
  `PlayData` for exactly this reason.

**Practice videos are a column,** matching `PracticeSession.equipment`:

- Hosted: `videos Json @default("[]")` on `PracticeSession`, added by a
  hand-written additive migration (`ALTER TABLE practice_sessions ADD COLUMN
  videos JSONB NOT NULL DEFAULT '[]'`, plus a `CHECK (jsonb_typeof(videos) = 'array')`
  recorded in a schema comment, since Prisma cannot model it). The create and
  update actions validate with `videoLinksSchema(MAX_SESSION_VIDEOS)`; absent
  means unchanged on update, `[]` clears.
- Rejected: a `PracticeVideo` child table. Nothing queries videos across
  sessions, the list is capped at 5 and always loaded with its parent, and a
  table would add a relation to every session read, copy and delete for no gain.
- Static: `StoredSession` gains an optional `videos`. `DB_VERSION` goes to the
  next free number after the drill field's bump (phase 1), with an upgrade case
  that writes nothing, following versions 5 and 6. The bump makes a tab running an older build reload
  before this build writes rows the older build would rewrite without the field.
  If parallel work takes that number first, this takes the next free one.

Per-row (per-instance) videos are out of scope. A drill's videos belong to the
drill, and a practice's to the practice.

### R7. Plan document (PLAN_VERSION stays 1)

An ADR-0020 amendment, "Practice video links (additive fields, version stays
1)":

- each drill's `playData.videos` (R2, R3), carried by the existing diagram;
- the session's `videos`, read with a `nullish().transform(v => v ?? [])`
  schema like `planEquipmentSchema`.

**Rules:**
- Read leniently: a missing or null list is none, and an unparseable entry is
  dropped (not an issue), so a bad link never blocks opening a plan. More than 5
  valid entries keeps the first 5.
- Writers emit the session's `videos` always (possibly `[]`) and a drill's
  `videos` only when non-empty, as `PlayData` writers do for `equipmentNeeds`.
- Readers built before the amendment strip both keys (`document.ts:6`,
  `playDataSchema` is a plain object), so files stay mutually readable. A round
  trip through an older build drops the videos and nothing else.
- The envelope (ADR-0022) and the YAML, TOML and JSONC encodings need no change.

### R8. Where videos show

| Surface | Hosted and static (shared components) |
|---|---|
| Drill editor (`PlayEditor.tsx`) | A "Videos" field below the description: URL input, optional title, optional start (`m:ss`). The link is parsed on blur and on Add. A recognized link shows its provider chip and the normalized URL; an error shows inline under the input. A list with move up, move down and remove buttons. Add is disabled at 5, with "Up to 5 videos per drill". The preview is the R4 card, so nothing loads. |
| Drill detail (`DrillDetailView.tsx`) | A "Videos" section under the description, rendered by `VideoLinkList`. Hidden when empty. |
| Library cards (`PlayLibrary`, `SidebarPlayCard`) | A small video icon with the accessible name "Has 2 videos". No links on the card. |
| Session editor and viewer (`SessionDrillCard`) | A "2 videos" button on a drill row that expands that drill's `VideoLinkList`. Practice-level videos in a "Videos" section beside staff and equipment, with the same editor field in edit mode. |
| Plan import preview (`PlanPreview.tsx`) | Per drill, the count and hosts ("2 videos: youtube.com, drive.google.com"), so the coach sees the destinations before importing. No inline players in the preview. |
| AI drafts | Stay video-free. Drafts start from `createEmptyPlayData()`, and no AI task may populate `videos`. A test pins that a drafted plan has none. |
| Starter drills (`lib/data/starter-plays.ts`) | Ship with no videos. The project bundles no third-party video links: their availability, licensing and content are outside the project's control. A coach adds their own after copying a starter. |

### R9. Bench sheet and exports

- **Printed bench sheet** (`print/BenchSheetDrill.tsx`) and **HTML export**
  (`export/bench-sheet-html.ts`): under a drill's text, one line per video:
  `▶ Breakout demo — youtu.be/Ab3dE5fG7hJ?t=90`. The short display form is
  `youtu.be/ID` for YouTube, `vimeo.com/ID` (plus hash) for Vimeo, and the host
  plus the first path segment, ellipsized at 40 characters, for the others. In
  HTML the line is a link to the full URL. Practice videos print once, below
  the header.
- **Word export** (`export/bench-sheet-docx.ts`): the same lines as hyperlinks.
- **Data model:** `bench-sheet-model.ts` gains `videos` on each drill and on the
  session, computed once. The renderers never parse URLs.
- **QR codes: not in the first release.** Typing a short URL from a sheet is
  workable, and a QR code needs an encoder. A QR option, if the owner wants it,
  comes as phase 4: an off-by-default "Add QR codes for videos" export option. A
  small dependency-free MIT encoder would be loaded with `import()` only when
  that option is on, following the lazy Word renderer
  (`export/export-bench-sheet.ts:51`). It would render to an inline image
  offline, never through a QR web service.
- Diagram image (PNG) exports are unchanged.

### R10. Accessibility

- Every card is a list item in a labelled list ("Videos for Breakout 5-man").
- **Open** is a link whose accessible name includes the title and "opens in a
  new tab". **Play here** is a button named "Play <title> here".
- When the player opens, focus moves to the iframe's **Close** button. When it
  closes, focus returns to **Play here**. The iframe has a `title`.
- Move up, move down and remove are buttons with names, operable by keyboard, no
  drag required. Touch targets are at least 44 by 44 px.
- Field errors are tied to the input with `aria-describedby`, and the provider
  chip text is announced politely.
- Nothing autoplays. Neither player URL sets `autoplay`.

### R11. Security and privacy summary

- Links are untrusted input from any imported plan. The allowlist decides only
  which links may embed, never whether a link is safe. That is why the host is
  always shown and `link` never embeds.
- Stored values are normalized URLs. The UI builds the embed URL from the parsed
  ID and hash, never from the stored string, so a crafted URL cannot inject
  player parameters or another origin.
- `rel="noopener noreferrer"` on every outbound link.
- No server fetches, resolves, unfurls or validates a link for reachability,
  hosted or static. Validation is syntactic.

### R12. Hosted authorization

There is no new action. Drill videos travel in the existing `createPlay` /
`updatePlay` input under `playData`. Session videos travel in the existing
session create and update actions. The existing rules apply unchanged: team
admins edit, members see shared practices. The Zod schemas reject a non-https
or over-long link before any database work.

### R13. YouTube referrer finding (verified 2026-10-11)

- YouTube's Required Minimum Functionality page, section on embedded player API
  client identity: API clients using the embedded player "must provide
  identification" through the HTTP Referer header. "YouTube recommends using
  `strict-origin-when-cross-origin` Referrer-Policy". A player opened with
  `window.open` must not use `noreferrer`. Embedded players need a viewport of
  at least 200 by 200 px, and 480 by 270 is recommended for 16:9.
  https://developers.google.com/youtube/terms/required-minimum-functionality
- The IFrame Player API reference lists error **153**: "The request does not
  include the `HTTP Referer` header or equivalent API Client identification",
  and 101/150 for owners who disable embedding.
  https://developers.google.com/youtube/iframe_api_reference
- Reports from sites with `Referrer-Policy: no-referrer` or `same-origin`
  match: the player shows error 153 until the iframe gets
  `referrerpolicy="strict-origin-when-cross-origin"`.

## Phasing

Each phase is one pull request that ships on its own.

1. **Drill links (no CSP change).** `lib/utils/video-links.ts` and its tests;
   `PlayData.videos` in types, `playDataSchema`, `upgradePlayData` and
   `sanitizePlayDataForWrite`; the editor field; `VideoLinkList` with **Open**
   only; drill detail, library indicator, session drill rows and import preview.
   The ADR-0020 amendment for the drill field. Hosted and static both: no
   hosted migration, and a static `DB_VERSION` bump with a no-op upgrade case.
2. **Inline player.** The **Play here** action and frame (R5); `frame-src`
   widened in `next.config.ts` and `plannerCsp`; CSP tests updated. Can be
   skipped or reverted without touching data.
3. **Practice videos.** `PracticeSession.videos` migration and action schemas;
   static `StoredSession.videos` and another `DB_VERSION` bump; `session.videos` in
   the plan document (amendment extended); session editor and viewer section.
4. **Exports.** Bench sheet, HTML and Word lines, and the `bench-sheet-model`
   fields. Optionally the lazy QR option, if the owner approves it (Open
   questions). Phase 4 can merge before phase 3, with drill lines only.

## Testing

- **Normalization** (`__tests__/lib/utils/video-links.test.ts`): a table of
  accepted forms per provider and their stored URL; `t=` and `start=` parsing
  (`90`, `1m30s`, `1h2m3s`) and the 86 399 cap; tracking-parameter removal;
  refusals for `http:`, `javascript:`, `data:`, credentials, ports, IP hosts,
  over-long URLs, a channel or playlist URL on a known host, and an ID of the
  wrong length. Idempotence of `url` and `provider`; a stored `startSec`
  survives a read and a write. Provider corrected when the stored value
  disagrees.
- **PlayData:** an invalid video entry is dropped on read with the rest of the
  drill intact. More than 5 is an error on write and truncated on read. An empty
  list is omitted on write. The element-count refine is unaffected.
- **Plan document:** round trip with drill and session videos; a file without
  them reads as `[]`; a file with a bad entry opens with that entry dropped; a
  fixture read through a schema with the keys removed (standing in for an older
  reader) yields the same plan minus videos; size check that 50 drills × 5
  maximum-length links stays under `MAX_PLAN_FILE_BYTES`.
- **Copy paths (hosted actions, mocked Prisma):** library → session copy,
  starter → library, duplicate session and import all preserve
  `playData.videos`.
- **Static store:** each version upgrade writes nothing and leaves existing rows
  readable; sessions save and load `videos`.
- **Components (jsdom):** `VideoLinkList` renders no `iframe` and no `img` with
  a remote `src` before activation. **Open** has `target="_blank"` and
  `rel="noopener noreferrer"`. **Play here** inserts one iframe with the
  nocookie or Vimeo URL built from the ID, the `referrerpolicy`, `title`,
  `sandbox` and `allow` attributes, and a minimum height of 200 px. Opening a
  second player closes the first. Focus moves on open and returns on close.
  Editor errors are announced and the Add button disables at 5.
- **CSP:** `__tests__/apps/planner/build-config.test.ts` asserts the exact
  `frame-src` (always including `'self'`). The hosted config test asserts the
  two added origins and no change to `script-src`, `connect-src` or `img-src`.
- **Exports:** bench-sheet HTML and Word tests show the short display text and
  full-URL hyperlinks. A sheet without videos is byte-identical to today's.
- **Manual (both builds):** play a public YouTube video and an unlisted Vimeo
  video inline on the static planner, where the page-level no-referrer is in
  force, and confirm no error 153. Confirm a video with embedding disabled shows
  the player's message with **Open** still available. Confirm DevTools shows no
  provider request before the click.

## Out of scope

Uploads of any kind; thumbnails; fetching titles or durations from providers;
per-row videos; playlists; video on the rink board or timeline; Drive or
OneDrive inline previews; links checked for reachability.

## Open questions for the owner

1. **Inline player at all?** Phase 2 widens two CSPs to two third-party origins.
   The alternative is links-only forever, which needs no CSP change. Ship phase 2,
   or stop at phase 1?
2. **QR codes on the bench sheet:** add the off-by-default lazy QR option
   (phase 4) with a small new dependency, or keep short printed URLs only?
3. **Practice-level videos:** worth a migration and a static `DB_VERSION` bump
   (phase 3), or are drill videos enough?
4. **Limit of 5 per drill and per practice:** right, or should it be 3?
5. **Plain `link` provider:** accept any https host (current ruling), or limit
   to the four named providers to narrow phishing risk in shared plans?
6. **Guidance copy about minors:** is the one-line "allowed to share" note
   enough, or should the editor say plainly not to link footage of identifiable
   players in plans shared by link?
7. **Vimeo `dnt=1`:** if Vimeo's own documentation no longer lists it, embed
   without it, or keep Vimeo as open-in-tab only?
