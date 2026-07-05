#!/usr/bin/env bun
/**
 * Runtime smoke test: boots the production build (`next start`), signs in
 * with a throwaway approved user, loads the critical public and authenticated
 * pages, and fails on any Server Components render error.
 *
 * This exists because RSC-boundary bugs (e.g. passing next/link as
 * `component={Link}` from a Server Component — the 2026-07-05 production
 * outage, PR #259) are invisible to type-check AND `next build`: dynamic
 * routes never prerender, so the crash only fires when a real request renders
 * the page. Requires a built `.next` (run `bun run build` first) and a
 * reachable DATABASE_URL with the current schema.
 *
 * Usage: bun scripts/smoke-test.ts [--port 3000]
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db/prisma";

const PORT = Number(process.argv[process.argv.indexOf("--port") + 1]) || 3000;
const BASE = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 60_000;

// The proxy enforces HTTPS in production mode and Server Actions verify the
// forwarded host against the origin; these headers satisfy both locally.
const FORWARD_HEADERS = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": `localhost:${PORT}`,
};

/** Server Components render failure marker (present in the streamed HTML). */
const RSC_ERROR_MARKER = "An error occurred in the Server Components render";
/** Next.js logs render errors to the server console with this prefix. */
const SERVER_ERROR_PREFIX = "⨯";

type PageCheck = {
  path: string;
  /** Case-insensitive substring that proves the page really rendered. */
  marker?: string;
  authed?: boolean;
};

const PAGES: PageCheck[] = [
  { path: "/", marker: "OpenLeague" },
  { path: "/signups", marker: "signup" },
  // /login is fully client-rendered — no server-side content marker exists.
  { path: "/login" },
  { path: "/dashboard", authed: true },
  { path: "/signup-events", marker: "Signup events", authed: true },
  { path: "/seasons", marker: "Seasons", authed: true },
  { path: "/seasons/proposals", marker: "Game proposals", authed: true },
  { path: "/calendar", authed: true },
  { path: "/roster", authed: true },
  { path: "/events", authed: true },
  { path: "/venue-admin", marker: "Venue", authed: true },
  { path: "/practice-planner", marker: "Practice", authed: true },
  { path: "/my-registrations", authed: true },
];

const serverLog: string[] = [];
let server: ChildProcess | undefined;
let smokeUserId: string | undefined;

function log(message: string) {
  console.log(`[smoke] ${message}`);
}

/** Minimal cookie jar: enough for NextAuth's csrf/callback/session cookies. */
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function request(
  jar: CookieJar,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...FORWARD_HEADERS,
      cookie: jar.header(),
      ...(init.headers ?? {}),
    },
  });
  jar.absorb(response);
  return response;
}

/** Follows same-origin redirects manually so the jar stays engaged. */
async function requestFollowing(jar: CookieJar, path: string): Promise<{ response: Response; finalPath: string }> {
  let current = path;
  for (let hop = 0; hop < 5; hop++) {
    const response = await request(jar, current);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "/";
      current = location.startsWith("http") ? new URL(location).pathname + new URL(location).search : location;
      continue;
    }
    return { response, finalPath: current };
  }
  throw new Error(`Too many redirects starting from ${path}`);
}

async function startServer(): Promise<void> {
  server = spawn(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      env: { ...process.env, NEXTAUTH_URL: BASE, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  server.stdout?.on("data", (chunk: Buffer) => serverLog.push(chunk.toString()));
  server.stderr?.on("data", (chunk: Buffer) => serverLog.push(chunk.toString()));

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`, { headers: FORWARD_HEADERS });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready within ${START_TIMEOUT_MS}ms`);
}

async function createSmokeUser(): Promise<{ email: string; password: string }> {
  const suffix = randomBytes(6).toString("hex");
  const email = `smoke-test-${suffix}@example.com`;
  const password = randomBytes(12).toString("hex");
  const user = await prisma.user.create({
    data: {
      email,
      name: "Smoke Test",
      passwordHash: await bcrypt.hash(password, 10),
      approved: true,
    },
    select: { id: true },
  });
  smokeUserId = user.id;
  return { email, password };
}

async function login(jar: CookieJar, email: string, password: string): Promise<void> {
  const csrfResponse = await request(jar, "/api/auth/csrf");
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  await request(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password }).toString(),
  });

  const session = await request(jar, "/api/auth/session");
  const payload = (await session.json()) as { user?: { email?: string } };
  if (payload?.user?.email !== email) {
    throw new Error(`Login failed for ${email}: session ${JSON.stringify(payload)}`);
  }
  log(`authenticated as ${email}`);
}

function newServerErrors(sinceIndex: number): string[] {
  return serverLog
    .slice(sinceIndex)
    .join("")
    .split("\n")
    .filter((line) => line.includes(SERVER_ERROR_PREFIX));
}

async function checkPage(jar: CookieJar, page: PageCheck): Promise<string | null> {
  const logIndex = serverLog.length;
  const { response, finalPath } = await requestFollowing(jar, page.path);
  const html = await response.text();

  if (page.authed && finalPath.startsWith("/login")) {
    return `${page.path}: bounced to /login — authenticated session was not honored`;
  }
  if (response.status !== 200) {
    return `${page.path}: HTTP ${response.status}`;
  }
  if (html.includes(RSC_ERROR_MARKER)) {
    return `${page.path}: Server Components render error in response HTML`;
  }
  const errors = newServerErrors(logIndex);
  if (errors.length > 0) {
    return `${page.path}: server logged render error(s):\n    ${errors.join("\n    ")}`;
  }
  if (page.marker && !html.toLowerCase().includes(page.marker.toLowerCase())) {
    return `${page.path}: expected content marker ${JSON.stringify(page.marker)} not found`;
  }
  return null;
}

async function cleanup(): Promise<void> {
  if (smokeUserId) {
    await prisma.user.delete({ where: { id: smokeUserId } }).catch(() => undefined);
  }
  await prisma.$disconnect().catch(() => undefined);
  server?.kill("SIGTERM");
}

async function main(): Promise<void> {
  log(`starting production server on :${PORT}`);
  await startServer();
  log("server ready");

  const credentials = await createSmokeUser();
  const sessionJar = new CookieJar();
  await login(sessionJar, credentials.email, credentials.password);
  // Public pages are checked logged-out — e.g. /login redirects
  // authenticated visitors away and would never show its own content.
  const anonymousJar = new CookieJar();

  const failures: string[] = [];
  for (const page of PAGES) {
    const failure = await checkPage(page.authed ? sessionJar : anonymousJar, page);
    if (failure) {
      failures.push(failure);
      log(`FAIL ${page.path}`);
    } else {
      log(`ok   ${page.path}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n[smoke] ${failures.length} page(s) failed:\n- ${failures.join("\n- ")}`);
    const errorLines = serverLog.join("").split("\n").filter((l) => l.includes(SERVER_ERROR_PREFIX) || l.includes("Error"));
    if (errorLines.length > 0) {
      console.error(`\n[smoke] server error log:\n${errorLines.slice(-40).join("\n")}`);
    }
    process.exitCode = 1;
  } else {
    log(`all ${PAGES.length} pages rendered cleanly`);
  }
}

try {
  await main();
} catch (error) {
  console.error("[smoke] fatal:", error);
  const tail = serverLog.join("").split("\n").slice(-40).join("\n");
  if (tail.trim()) console.error(`[smoke] server log tail:\n${tail}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
