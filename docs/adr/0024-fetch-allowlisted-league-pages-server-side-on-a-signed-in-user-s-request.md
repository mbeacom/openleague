---
schemaVersion: 0.2.0
id: "0024"
title: "Fetch allowlisted league pages server-side on a signed-in user's request"
status: proposed
date: 2026-10-07
deciders: ["@mbeacom"]
tags: [rankings, static-site, security, ssrf, interchange, privacy]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0002", "0008", "0011", "0015", "0020", "0021"]
affects:
  - type: path
    pattern: "lib/league-fetch/**"
    note: The outbound fetch guard (allowlist, https/443, redirects, DNS, deadline, size, content type) and its configuration.
  - type: path
    pattern: "lib/actions/league-fetch.ts"
    note: The server action that authenticates, rate-limits, fetches, parses and builds the planner link.
  - type: path
    pattern: "lib/rankings-document/pull.ts"
    note: The versioned, compressed schedule handoff shared by the hosted page and the static import.
  - type: path
    pattern: "lib/plan-document/pending.ts"
    note: The login carry-over, now for a #src= league page as well as a #plan= plan.
  - type: path
    pattern: "app/**/practice-planner/fetch-schedule/**"
    note: The signed-in confirm page.
  - type: path
    pattern: "components/features/league-fetch/**"
    note: The confirm card that calls the action and navigates to the planner.
  - type: path
    pattern: "app/**/login/page.tsx"
    note: Stashes the #src= fragment across sign-in.
  - type: path
    pattern: "apps/planner/src/routes.ts"
    note: The #/rankings/import?pull= route.
  - type: path
    pattern: "apps/planner/src/screens/rankings/pulled-schedule.ts"
    note: Decodes a pull into a page source for the usual import preview.
  - type: path
    pattern: "lib/utils/durable-rate-limit.ts"
    note: LEAGUE_FETCH_PER_USER, checked fail-closed.
  - type: path
    pattern: "lib/rankings-document/fetch-notice.ts"
    note: The robots.txt refusal wording and the static import's ?notice= route value, shared by both apps.
  - type: path
    pattern: "apps/planner/src/screens/rankings/RankingsImportScreen.tsx"
    note: Shows a robots.txt refusal above the paste and upload boxes.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-hosted-league-page-fetch-design.md
review:
  tier: async
  tierReason: Adds the platform's first user-triggered outbound fetch of a third-party site; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0024: Fetch allowlisted league pages server-side on a signed-in user's request

## Context

ADR-0021 put placement rankings in the static app and ruled out fetching
league pages: browsers block cross-origin reads, page structure changes, and
site terms may not allow automated collection. Coaches paste or save the
schedule page instead. That works, but on a phone it is the hardest step of
the tool: "select all, copy, switch apps, paste" rarely keeps the cells
apart, and saving a page is awkward on mobile.

The hosted app (openl.app) can make the request a browser can't. A server
that fetches URLs on request is a classic server-side request forgery (SSRF)
surface, and the request goes to a third party's site. So the question is
whether a narrow, user-triggered fetch can be made safe enough, and where the
result should go.

## Decision

We will add one signed-in, user-triggered path on the hosted app that fetches
one public league schedule page and hands the parsed games to the static
planner. It amends ADR-0021's "no fetching" for this path only; the static app
itself still never requests a league site.

- **Trigger.** The static planner's "Fetch it for me" opens
  `/practice-planner/fetch-schedule#src=<league URL>`. The address rides in the
  fragment, so it never reaches a server log; login carries it over the way
  ADR-0020 carries `#plan=`.
- **Consent.** The page asks once ("Fetch <host> schedule page?"). The server
  action (ADR-0002) requires sign-in only, validates the input with Zod, and
  rate-limits per user through the durable limiter, fail-closed.
- **Guard.** Only https on port 443; only hosts on a server-configured exact
  allowlist (`LEAGUE_FETCH_ALLOWED_HOSTS`); no IP-literal hosts and no user
  info; redirects followed by hand, at most three, same host only, every check
  re-run; every resolved address public; a 60 s total deadline (configurable, 5-90 s) over DNS, connect and
  body; a 2 MB streamed cap; `text/html` only; a fixed User-Agent; no
  cookies, credentials or cache. Logs carry the host, status and an error
  kind, never the path, query or content.
- **Result.** The server parses the page with the same pure parser the static
  app uses and returns a link to the static planner built from configuration
  (`NEXT_PUBLIC_STATIC_PLANNER_URL`, else `https://openleague.dev/planner/`),
  never from the request, with `#/rankings/import?pull=<payload>`. The payload
  is versioned JSON of the parsed games and teams, deflate-raw compressed and
  base64url encoded, with hard caps on both its encoded and inflated size.
- **Nothing is stored.** No page, game, URL or result is kept on the hosted
  platform. FR-026 is unaffected: results go only to the user's device, where
  nothing saves until they choose Save.

## Options considered

### Option A: Allowlisted server-side fetch, fragment handoff (chosen)

| Dimension | Assessment |
|---|---|
| Mobile experience | One tap and a confirm; no copy and paste |
| SSRF exposure | Bounded by an exact host allowlist, plus https/443, same-host redirects and a DNS check |
| Third-party load | One request per tap, at most 10 per user per hour |
| Privacy | Nothing stored; the URL and the payload stay in fragments |
| Portability | Static app unchanged in principle: it still only reads what it is handed |

### Option B: Keep paste-only (ADR-0021 as written)

**Pros:** no outbound surface at all; no question about site terms.
**Cons:** the phone flow stays the weakest part of the tool.

### Option C: A general "fetch any URL" proxy

**Pros:** works for every league without configuration.
**Cons:** an open SSRF and abuse surface; a DNS check alone can't make an
arbitrary-host fetch safe. Rejected.

### Option D: Hand the result back by `postMessage` to the opener

**Pros:** the payload never appears in a URL or browser history.
**Cons:** depends on `window.opener`, which mobile browsers, in-app browsers
and `noopener` links lose. Rejected in favour of the fragment.

## Trade-offs

- The DNS check runs before each request, but Node's `fetch` resolves the
  name again to connect, so a host that changes its answer in between could
  still be reached. Pinning the connection needs undici's `Agent` as a direct
  dependency. The exact-host allowlist is the primary control, since an
  attacker would have to control an allowlisted league's DNS. The DNS check is
  defense in depth.
- The payload is visible in the browser history entry that first opens the
  planner; the static app replaces that entry's hash as soon as it reads it.
- The per-user limit uses the database (ADR-0015's in-memory limiter is
  advisory); when the database is down, fetches are refused, not allowed.

## What would make this wrong

- A league asks us not to fetch its pages, or its terms forbid user-triggered
  fetches. The host leaves the allowlist.
- A league publishes a machine-readable results feed: fetch that instead.
- The handoff grows past a fragment's practical size, or needs to carry
  anything private. It would then need a different channel.

## Amendments

### 2026-10-11: Honour robots.txt

OpenLeague does not fetch a page that the site's robots.txt disallows. The
allowlist says which sites we may ask; robots.txt says what each site asks of
automated tools, and it is the site's own, current answer.

**Rule.** Before each user-initiated fetch, the server fetches
`https://<host>/robots.txt` through the same guard (https/443, allowlist, DNS
check, same-host redirects, no credentials) and within the same total deadline
as the page. It reads the file per RFC 9309: groups by user-agent, matched on
the product token `OpenLeague` (case-insensitive) and falling back to `*`;
the longest matching Allow or Disallow wins, and an Allow wins a tie; `*` and
a trailing `$` are wildcards; paths compare case-sensitively after
percent-encoding normalisation. The page's path and query are checked, and so
is every same-host redirect the page takes. The User-Agent on both requests
starts with the same token: `OpenLeague/1.1 (+https://openleague.dev; league
page fetch on a user's request; honours robots.txt)`.

**Status handling.**

| robots.txt response | Result |
|---|---|
| 2xx | Parsed (any content type, UTF-8, at most 500 KiB) |
| 4xx, including 404 | No rules: the page may be fetched |
| 429 | Fail closed: the site is asking us to slow down |
| 5xx, network error, timeout | Fail closed |
| Over 500 KiB, not UTF-8, more than 5 redirects, a redirect the guard refuses | Fail closed |

Failing closed refuses the fetch with "couldn't check the site's rules" and
is not cached, so the next try asks again.

**Crawl-delay.** A Crawl-delay in our group is kept as a minimum gap between
our requests to that host (the robots.txt request counts). A gap of up to
10 s that still leaves 5 s of the deadline is waited out; a longer one is
refused with the time to try again. The spacing and the robots.txt cache
(at most 24 hours, shorter when Cache-Control says so) live in the server
instance's memory. Serverless instances don't share them, so each instance
reads robots.txt for itself and spaces only its own requests; the durable
per-user rate limit (10 per hour) still bounds the total.

**Written permission.** `ROBOTS_PERMISSIONS` in `lib/league-fetch/config.ts`
lists hosts whose owners have given written permission to fetch despite
robots.txt, each with a note of where that permission is recorded. It is
empty by default and kept in code so every change is reviewed. A listed host
skips only the Disallow refusal: Crawl-delay and failing closed still apply.

**Screens.** A disallowed page gets "This site asks automated tools not to
fetch this page. Open it in your browser, then paste or upload it here." with
a link to the static import (`#/rankings/import?notice=robots-disallowed`),
which repeats the message above its paste box and file picker. A robots.txt
that couldn't be read gets "Couldn't check the site's rules — try again or
paste the page.", Try again, and the same link.

**Cost.** The first fetch from an instance makes one more request, and on a
slow site the robots.txt request uses part of the deadline the page used to
have to itself. Later fetches within the cache period don't repeat it.

**What would make this wrong.** A league whose robots.txt disallows its
schedule pages but wants coaches to use this tool should give written
permission (and be listed), or change its robots.txt to allow `OpenLeague`.
