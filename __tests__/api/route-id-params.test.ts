import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route handlers check the format of id, slug and token path segments before
 * any query, and answer a malformed value the way they answer a missing one.
 */

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "cluser00000000000000000001", email: "a@example.com" } })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(),
}));
vi.mock("@/lib/media/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/blob")>()),
  isBlobEnabled: () => true,
}));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "https://example.test" }));

import { GET as associationIcs } from "@/app/api/associations/[slug]/schedule.ics/route";
import { POST as brandingUpload } from "@/app/api/branding/[entity]/[entityId]/logo/upload/route";
import { GET as eventInvitation } from "@/app/api/event-invitations/[token]/route";
import { GET as invitation } from "@/app/api/invitations/[token]/route";
import { GET as leagueIcs } from "@/app/api/leagues/[leagueId]/schedule.ics/route";
import { GET as leagueTeams } from "@/app/api/leagues/[leagueId]/teams/route";
import { GET as rosterExport } from "@/app/api/roster/export/route";
import { POST as mediaUpload } from "@/app/api/signup-events/[eventId]/media/upload/route";
import { GET as eventRosterExport } from "@/app/api/signup-events/[eventId]/roster/export/route";

const request = (url = "https://example.test/x") => new Request(url) as never;
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

const cases: Array<{ name: string; run: (bad: string) => Promise<Response>; status: number; location?: RegExp }> = [
  {
    name: "associations/[slug]/schedule.ics",
    run: (bad) => associationIcs(request(), params({ slug: bad })),
    status: 404,
  },
  {
    name: "branding/[entity]/[entityId]/logo/upload",
    run: (bad) => brandingUpload(request(), params({ entity: "team", entityId: bad })),
    status: 404,
  },
  {
    name: "event-invitations/[token]",
    run: (bad) => eventInvitation(request(), params({ token: bad })),
    status: 307,
    location: /invitation=invalid/,
  },
  {
    name: "invitations/[token]",
    run: (bad) => invitation(request("https://example.test/api/invitations/x"), params({ token: bad })),
    status: 307,
    location: /error=invalid_invitation/,
  },
  {
    name: "leagues/[leagueId]/schedule.ics",
    run: (bad) => leagueIcs(request(), params({ leagueId: bad })),
    status: 404,
  },
  {
    name: "leagues/[leagueId]/teams",
    run: (bad) => leagueTeams(request(), params({ leagueId: bad })),
    status: 403,
  },
  {
    name: "roster/export",
    run: (bad) => rosterExport(new Request(`https://example.test/api/roster/export?teamId=${encodeURIComponent(bad)}`)),
    status: 400,
  },
  {
    name: "signup-events/[eventId]/media/upload",
    run: (bad) => mediaUpload(request(), params({ eventId: bad })),
    status: 404,
  },
  {
    name: "signup-events/[eventId]/roster/export",
    run: (bad) => eventRosterExport(request(), params({ eventId: bad })),
    status: 403,
  },
];

beforeEach(() => {
  recorder.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(cases)("$name", ({ run, status, location }) => {
  it.each([["a malformed value", "Not A Valid Value!"], ["a short value", "T1"]])(
    "answers %s without querying",
    async (_label, bad) => {
      const response = await run(bad);
      expect(response.status).toBe(status);
      if (location) expect(response.headers.get("location")).toMatch(location);
      expect(recorder.calls).toEqual([]);
    },
  );
});
