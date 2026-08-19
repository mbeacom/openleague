# Operator Onboarding Runbook

How to stand up an OpenLeague instance: designate the platform administrator,
create a league (association), and load the league-scoped features — gear
inventory in particular.

This is written for a self-hosting operator. It contains no secrets and no
organization-specific values; every placeholder is yours to fill in.

---

## 1. Designate the platform administrator

Platform admin gates `/admin`, `/admin/users`, and `/admin/audit` — user
approval, suspension, and cross-tenant enumeration. It is **not** the same as
`LEAGUE_ADMIN`: a league admin cannot reach any of those routes. That
separation is deliberate. Granting admin from "is a LEAGUE_ADMIN of any league"
would be self-grantable — anyone could create a throwaway league and promote
themselves.

A user is a platform admin when **either**:

- their `User.isPlatformAdmin` column is `true`, or
- their login email appears in the `PLATFORM_ADMIN_EMAILS` allowlist
  (comma-separated).

The env allowlist exists so the first admin can be designated without a manual
database write. Neither path is reachable from inside the app UI.

> The allowlist matches the account's **login email**, case-insensitively. It is
> not a claim anyone can make: a stranger who registers your allowlisted address
> still cannot log in, because sign-in refuses any account whose email has not
> been verified through an emailed link.

### Local development

`.env.local` (gitignored) already carries the key. Set it and restart:

```bash
PLATFORM_ADMIN_EMAILS="you@example.com"
```

### Production (Vercel)

Set it as a production environment variable, then redeploy so the running
functions pick it up:

```bash
vercel env add PLATFORM_ADMIN_EMAILS production
# paste: you@example.com   (or a,b,c for several admins)

vercel env ls                 # confirm it registered
vercel --prod                 # redeploy so functions see the new value
```

Until this is set in production, `/admin` 404s for **everyone**, including you.
That is the intended default — the platform ships with no admin rather than a
guessable one.

### Verifying the lockdown

Log in as an account that is *not* on the allowlist — a `LEAGUE_ADMIN` is the
sharpest test, since that is the privilege-escalation path the design closes:

- the sidebar shows **no** "Admin" entry, and
- `/admin`, `/admin/users`, and `/admin/audit` all render **404**, not "access
  denied". A distinct denial page would confirm the route exists to anyone
  probing for it.

Then log in as the allowlisted account and confirm the "Admin" entry appears
and all three routes load.

### Promoting later admins

Once you hold the role, promote others from `/admin/users` rather than by
growing the env allowlist. Keep the allowlist as the bootstrap path only — it
is the one grant that survives losing database access.

---

## 2. Create your league (association)

A team can operate standalone; a league is what unlocks divisions, cross-team
scheduling, and every league-scoped feature including gear.

1. Sign up and verify your email (check the inbox — sign-in is refused until
   the address is confirmed).
2. In the sidebar, open **Leagues** → fill in **Create Your League or
   Association** → **Create League**.
3. You are set up as `LEAGUE_ADMIN` and land on the league dashboard.

The sidebar switches to league mode and now carries **Gear**, **Operations**,
**Venue Reservations**, **Teams**, **Divisions**, **Statistics**, and
**Reports**.

> If a brand-new account sees no **Leagues** entry, it is running a build from
> before that nav entry existed. Single-team mode previously had no link to
> `/league` at all, which left league creation — and everything league-scoped
> behind it — reachable only by typing the URL.

Then, in whatever order suits you:

- **Divisions** — age groups or skill tiers (`/league/<id>/divisions`)
- **Teams** — create teams and assign them to divisions
- **Invitations** — invite team admins by email
- **Venues** — add your rinks/fields; venues carry surfaces and schedule blocks

---

## 3. Load gear inventory

Gear is **league-scoped**: it lives at `/league/<leagueId>/gear` and appears in
the nav only once you belong to a league. There is no standalone-team gear view.

The inventory model separates two tracking modes:

- **Pooled stock** — interchangeable quantities (practice jerseys, pucks). You
  track a count per location and condition.
- **Tagged units** — individually identified items (goalie sets, radios). Each
  unit is tracked on its own so it can be assigned and returned.

Load it in this order — each step depends on the one before:

1. **Location** — a storage site (e.g. an equipment room). Address and
   admin-only notes are optional.
2. **Catalog item** — what the thing *is*: name, category, optional
   size/brand/model, and its **tracking mode** (pooled or tagged).
3. **Pooled stock** / **Tagged unit** — the actual inventory, placed at a
   location with a condition and an opening quantity.

Every adjustment writes to the movement ledger with quantity, condition
transition, timestamp, acting user, and your stated reason — so "where did the
jerseys go" has an answer. Review it under **Recent inventory activity**.

The sibling workspaces:

| Workspace | Path | Purpose |
|---|---|---|
| Needs | `/league/<id>/gear/needs` | Requests for gear the league doesn't have |
| Reservations | `/league/<id>/gear/reservations` | Borrow/return lifecycle |
| Wishlist | `/league/<id>/gear/wishlist` | Public-facing donation asks |

The wishlist has a public token URL (`/gear-wishlist/<token>`) you can share
outside the app for donations.

---

## 4. Optional: scheduled jobs

Four cron routes exist under `/api/cron/` — `rsvp-reminders`,
`gear-notifications`, `notification-batches`, and `event-waitlist`. Each
requires a `CRON_SECRET` bearer token and **refuses to run when the secret is
unset**, rather than falling open and emailing your members.

```bash
vercel env add CRON_SECRET production     # openssl rand -base64 32
```

Schedules live in `vercel.json`.

---

## 5. Demo/dev data

`prisma/seed.ts` creates a worked example: a league with divisions, four teams,
a venue, a season with phases, a role matrix of test accounts, and a game
proposal inbox in several states.

It refuses to run against a non-local database host, because Neon production
and dev-branch hostnames are indistinguishable and a wrong guess writes fake
teams into real data. For a disposable local database:

```bash
docker run -d --name openleague-dev-db \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=devuser -e POSTGRES_DB=openleague \
  -p 55433:5432 postgres:16-alpine

export DATABASE_URL="postgresql://devuser:devpass@localhost:55433/openleague"
bun run db:migrate:deploy
bun run db:seed
bun run dev
```

To seed a remote database you have confirmed is disposable, set `FORCE_SEED=1`.
Do not set it to save a step — it is the only thing standing between the seed
and production.

Seeded accounts are printed when the seed finishes; all use throwaway
`@test.com` addresses and are pre-verified so they can log in immediately.

---

## Troubleshooting

**Type errors mentioning Prisma members that plainly exist** (`has no exported
member named 'SeasonScheduleVisibility'`, relations reported missing on a model
that declares them) — the generated client is stale, not the code:

```bash
bun run db:generate
```

Run it after every pull that touches `prisma/schema.prisma`. A stale client
produces a wall of confident-looking errors in files you never edited.

**`bun run build` fails inside `postcss.config.js`** with
`__turbopack_context__.a is not a function` — a poisoned Turbopack cache, not a
code fault:

```bash
rm -rf .next && bun run build
```

**Dev server returns 403 for every `/_next/static/chunks/*`, page loads
unstyled and unresponsive** — you reached the dev server on a host other than
the one it booted on (by IP instead of `localhost`, say). Next 16 treats that as
cross-origin. `allowedDevOrigins` in `next.config.ts` lists the permitted extras;
add yours there. This affects development only.

**Sign-in rejects a known-good password** — the account's email is unverified.
The login page offers a resend link. With `EMAIL_PROVIDER=log`, the message is
written to the server console instead of being sent.
