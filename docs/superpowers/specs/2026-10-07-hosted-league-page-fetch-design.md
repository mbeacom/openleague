# Hosted League Page Fetch ("Fetch it for me") — Design

**Date:** 2026-10-07
**Status:** Proposed (design and implementation in one change)
**Decision record:** ADR-0024 (amends ADR-0021's "no fetching" for this one path; extends ADR-0020's fragment handoff)
**Applies to:** the hosted app (openl.app) and the static app's rankings import (openleague.dev/planner/)
**Depends on:** the static rankings design (`2026-10-07-static-rankings-design.md`), its schedule parser (`lib/ratings/import`), the `#plan=` login carry-over (`lib/plan-document/pending.ts`), the durable rate limiter (`lib/utils/durable-rate-limit.ts`)

## Context

The static rankings tool reads a league's schedule page from text or a file the
user supplies (static rankings spec R2). On a desktop that works. On a phone it
is the hardest step: a plain-text copy runs cells together, and saving a page is
awkward. The static app can't fetch the page itself: browsers block
cross-origin reads, and R2 keeps it that way.

The hosted app can make the request. A server that fetches a URL on request is a
server-side request forgery (SSRF) surface, and the request reaches a third
party's site. This design keeps that surface as narrow as it can be and still
spare a coach the copy and paste.

## Goal

A signed-in coach taps "Fetch it for me" in the static Rankings tool, confirms
once on the hosted app, and lands back in the static import with the usual
preview. Nothing saves until they choose Save. The hosted platform stores
nothing.

## Flow

1. **Static planner.** "Fetch it for me" opens
   `https://openl.app/practice-planner/fetch-schedule#src=<encoded league URL>`
   (`hostedFetchUrl(leagueUrl)` in `apps/planner/src/config.ts`). The address
   is in the fragment, so it never reaches a server or its logs.
2. **Sign-in.** The page sits under `(dashboard)`, whose layout requires
   sign-in. Its redirect to `/login` keeps the fragment, and the login page
   stashes `src` in sessionStorage (30-minute expiry, own key) exactly as it
   does a `#plan=` link, then sends the user to the fetch page after sign-in.
3. **Confirm.** One card: "Fetch <host> schedule page?", the full address, a
   sentence on what happens, one primary button. The page reads the fragment
   (or the stash) and clears both immediately. An address that isn't https on
   the default port, or whose host isn't on the allowlist, gets an explanation
   and no button.
4. **Fetch.** The button calls the `fetchLeagueSchedule` server action. It
   authenticates, validates, checks the URL rules, takes one from the user's
   rate limit, and fetches under the guard (below).
5. **Parse and compress: server-side.** The server already has the page, and
   the parser is pure and portable, so it runs there. The raw HTML (hundreds
   of kilobytes) never leaves the server; the browser receives a few kilobytes.
   Dates go out in ISO form with their year, so the static side needs no
   season-year guess.
6. **Back to the planner.** The action returns a URL built from configuration:
   `NEXT_PUBLIC_STATIC_PLANNER_URL` (normalized to end in `/`, https only,
   http only for localhost), else `https://openleague.dev/planner/`, plus
   `#/rankings/import?pull=<payload>`. Nothing from the request goes into it.
   The page goes there with `location.replace`, so Back doesn't return to a
   spent confirm page.
7. **Static import.** The route `#/rankings/import?pull=…` decodes the payload,
   replaces the hash with `#/rankings/import` so the payload leaves the address
   bar, and loads the schedule as a page source labelled "Schedule fetched from
   <host>". The usual preview, unread-lines list, snake chart, conflict choice
   and merge apply. Nothing saves until the user chooses Save.

### Why the static import reads a rendered page

The payload carries parsed games, but the static side turns it back into a
small HTML table (`schedulePullSource`) and loads that like an opened page.
`parseSchedule` reads it back to exactly the same games and teams (tested), and
every existing path that re-reads the page source (a season-year change, a snake
chart read after the schedule) keeps working. It also fits the `importScheduleSource(text, { sourceUrl, label })` entry point
that the Update results change adds to the import screen, so the two land
together without a second import path. Unread lines go first, before
any date, so they are listed again and can never pair up into a game.

## Payload

`lib/rankings-document/pull.ts`, shared by the hosted server, the hosted page
and the static app, and covered by the ADR-0020 portability guard.

```jsonc
{
  "f": "openleague.schedule-pull", "v": 1,
  "src": "https://league.example.org/schedule", "at": "2026-10-07T12:00:00.000Z",
  "t": [["901", "Riverside M1"], ["902", "Lakeview M2"]],          // teams
  "r": ["Rink A"],                                                    // rinks, by index
  "g": [["2026-09-26", "15:40", "901", "902", 4, 9, 0]],              // date, time, home, away, goals, goals, rink (-1: none)
  "u": ["905 Unread line"]                                            // a sample of unread lines
}
```

- **Encoding.** JSON, then `CompressionStream("deflate-raw")`, then base64url,
  reusing the plan link's helpers.
- **Size.** A fictional 190-game, 40-team page encodes to about 2.5 KB.
- **Caps.**
  - The fragment value is at most 24 000 characters. Longer values are refused
    before any decoding.
  - Inflation stops at 192 KB, so a small "bomb" is refused.
  - At most 1 000 games, 400 teams, 100 rinks, and 40 unread lines.
  - Names, rinks and lines are clipped to 120 characters, and the source URL to
    2 048.
  - The encoder refuses past any cap. The action then says the schedule is too
    large to hand over and suggests saving the page.
- **Strict decode.** Every tuple is checked for shape. Dates are ISO, times are
  `HH:MM`, and goals are integers from 0 to 99, both present or both absent. A
  game's teams must be listed and different, rink indexes must be in range, and
  the source must be https. Anything else makes the whole pull unreadable,
  never partly read.
- **Versions.** `v` greater than 1 gets "from a newer version of OpenLeague";
  any other mismatch is unreadable.

## SSRF and abuse controls

`lib/league-fetch/guard.ts` is pure apart from Node's `dns` and `net`, and takes
the fetch and DNS lookup as options so every rule is tested without a network.

| Control | Rule | Test |
|---|---|---|
| Scheme | `https:` only | `checkLeagueUrl` refuses http, ftp |
| Port | default (443) only; explicit `:443` allowed, any other refused | refuses `:8443`, `:80` |
| User info | none | refuses `user:pass@` |
| IP literals | refused, including decimal IPv4 forms the URL parser normalizes and bracketed IPv6 | refuses `93.184.216.34`, `2130706433`, `[::1]` |
| Allowlist | exact host match against `LEAGUE_FETCH_ALLOWED_HOSTS` (comma or space separated; default `www.cshlhockey.org`); subdomains and lookalikes refused | refuses other hosts, `x.<host>`, `<host>.evil…`; no DNS or fetch happens |
| Redirects | `redirect: "manual"`; at most 3; same host only (never another host, even an allowlisted one); every URL rule and the DNS check re-run per hop; a 3xx without `Location` refused | follows 3, refuses a 4th; refuses another host, an internal IP, http, another port, a host that now resolves inward |
| DNS | every address the host resolves to must be public: refuses loopback, private, link-local, CGNAT, unspecified, multicast, reserved, documentation, unique-local and IPv4-mapped or NAT64 forms of those | address table; refuses when any one address is private; refuses DNS failure or no answer |
| Deadline | one 10 s deadline over DNS, every hop and the body | a fetch, a body and a lookup that never settle all time out |
| Size | `Content-Length` over 2 MB refused unread; the body streamed and aborted past 2 MB of decoded bytes | both, with the stream stopped after a few chunks |
| Content type | `text/html` only (charset honoured) | refuses JSON, plain text, XHTML, `text/htmlx`, missing |
| Status | 200 only | 404 refused and logged |
| Identity | fixed `User-Agent: OpenLeague-LeaguePageFetch/1.0 (+https://openleague.dev; user-requested)`, `Accept: text/html` | asserted on the request |
| No credentials | `credentials: "omit"`, no headers forwarded from the user's request, `referrerPolicy: "no-referrer"` | asserted on the request |
| No cache | `cache: "no-store"`; nothing cached in memory | asserted on the request |
| Rate limit | 10 per user per hour, durable (database), fail-closed; taken only after the URL rules pass, so a typo costs nothing | action tests: limited before any fetch, key and fail-closed asserted; a disallowed host doesn't touch the limit |
| Logging | one line per fetch: `{ event, host, status, outcome }`, never the path, query or content; error messages carry a kind, never the URL | asserted on the log and on error messages |

**The DNS check's limit.** Node's `fetch` resolves the name again to connect, so
a host that answers differently between the check and the connection could
still be reached (DNS rebinding). Pinning the connection to the checked address
needs undici's `Agent` with a custom `lookup`, as a direct dependency. That
isn't worth it here: the allowlist is exact and operator-set, so an attacker
would have to control an allowlisted league's DNS. The check is defense in
depth, not the primary control.

**Function duration.** The page exports `maxDuration = 30`, so a 10 s fetch
plus parsing fits on any Vercel plan.

## Authorization

`requireUserId()` only, outside the try so the sign-in redirect isn't swallowed.
No team or league role: it is a personal tool, and its output goes only to the
user's own browser. Input is `{ url: string }`, trimmed and capped at 2 048
characters by Zod, then checked by the guard.

## Privacy and legal

- **Nothing is stored.** No page, game, URL or result is written on the hosted
  platform, and the hosted platform does not publish results. The FR-026 rule
  (hosted views hide results below the score-recording age) is unaffected:
  results reach only the user's device, as with a pasted page.
- **The static app's privacy note** gains one sentence saying what "Fetch it
  for me" does: it opens OpenLeague's hosted app, which fetches the league page
  for a signed-in account.
- **Browser history.** The league URL is in the fragment of the hosted page's
  first history entry until the page clears it. The payload is in the fragment
  of the planner's first entry until the import reads it. Both hold public
  information, and both are replaced as soon as they are read.
- **Open question for the owner:** do the league site's terms of use permit
  user-triggered fetches of its public pages? Until that is answered, the
  allowlist default is the one league the tool was built for, and the host can
  be removed with configuration alone.

## Why the fragment and not postMessage

A `postMessage` handoff needs the hosted page to keep a reference to the
planner window that opened it. Mobile browsers, in-app browsers and `noopener`
links drop that reference, and the sign-in detour breaks it anyway. A fragment
works on every browser, survives the login redirect, and never reaches a
server. Its cost is the brief history exposure above.

## Hosted route

`app/(dashboard)/practice-planner/fetch-schedule/` sits beside
`practice-planner/import`. Both pages are hosted companions of the static
planner. The `(dashboard)` layout's sign-in redirect is the one the plan
handoff already relies on to keep a fragment. The client component lives in
`components/features/league-fetch/`, outside the portable
`components/features/practice-planner/**` glob, because it imports a server
action.

## Static side

- `apps/planner/src/routes.ts`: `#/rankings/import?pull=…` matches
  `{ name: "rankingsImport", pull }`. Only this route takes a query.
- `apps/planner/src/screens/rankings/pulled-schedule.ts`: decodes once, clears
  the hash, returns `{ content, label, sourceUrl }` or a user-worded error.
- `RankingsImportScreen` takes an optional `pull` prop and loads the result
  like an opened page.
- `hostedFetchUrl(leagueUrl)` in `apps/planner/src/config.ts` builds the hosted
  link. `FetchForMeAction` puts a "Fetch it for me" link in the Update results
  panel's `fetchAction` slot, pointing at the saved schedule page's address,
  with a one-line note that it opens OpenLeague's hosted app, where a signed-in
  account fetches the page. It is not shown when no schedule page is saved.
- The import passes the pull to `importScheduleSource(content, { sourceUrl,
  label })`, so saving also remembers the page's address.

## Testing

All fixtures are fictional (9xx teams, Rink A and Rink B, `*.example.org`). CI
makes no network call: the guard takes a fake `fetch` and `lookup`, and the action
tests stub the global fetch and mock `node:dns/promises`.

- Guard: every row of the controls table.
- Action:
  - sign-in required before anything else;
  - invalid URLs;
  - a disallowed host, which doesn't touch the limit;
  - http;
  - a redirect to another host;
  - an oversized page, a timeout and a wrong content type;
  - a private address;
  - rate limited, with the key and fail-closed asserted;
  - no games;
  - success, with the payload decoded;
  - the planner URL taken from configuration and its default.
- Payload:
  - a 190-game round trip under the cap;
  - the unread-line cap;
  - the encode caps;
  - an oversized fragment;
  - an inflation bomb;
  - malformed base64, deflate and JSON;
  - every strict-shape rule;
  - a newer and an older version;
  - `schedulePullSource` read back to identical games and teams.
- Static:
  - the route table;
  - `hostedFetchUrl`;
  - the import screen previewing a pull, clearing the hash, and saving only on Save;
  - a damaged pull shown as an error.
- Login carry-over: `#src=` stashed under its own key, expiry, fragment before stash.
