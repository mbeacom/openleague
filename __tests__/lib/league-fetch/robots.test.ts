/** The robots.txt parser and gate (ADR-0024, 2026-10-11 amendment), against RFC 9309's rules. Pure: no network. */
import { describe, expect, it } from "vitest";
import {
    isAllowedByRobots,
    matchesRobotsPattern,
    normalizeRobotsPath,
    parseRobotsTxt,
    ROBOTS_CACHE_TTL_MS,
    ROBOTS_PRODUCT_TOKEN,
    RobotsGate,
    type RobotsPolicy,
} from "@/lib/league-fetch/robots";

const allowed = (robots: string, path: string, token = ROBOTS_PRODUCT_TOKEN) => isAllowedByRobots(parseRobotsTxt(robots, token), path);

describe("parseRobotsTxt and isAllowedByRobots", () => {
    it.each<[string, string, string, boolean]>([
        // Nothing applies.
        ["an empty file", "", "/schedule", true],
        ["only comments", "# nothing here\n# at all", "/schedule", true],
        ["rules for another agent only", "User-agent: ExampleBot\nDisallow: /", "/schedule", true],
        ["rules before any user-agent line", "Disallow: /\nUser-agent: *\nAllow: /x", "/schedule", true],
        // Basic matching.
        ["a site-wide disallow", "User-agent: *\nDisallow: /", "/schedule", false],
        ["a prefix disallow", "User-agent: *\nDisallow: /sched", "/schedule/8u", false],
        ["a disallow for another path", "User-agent: *\nDisallow: /private", "/schedule", true],
        ["an empty Disallow (allows everything)", "User-agent: *\nDisallow:", "/schedule", true],
        ["an empty Allow alongside a disallow", "User-agent: *\nAllow:\nDisallow: /", "/schedule", false],
        // Longest match wins; an Allow wins a tie.
        ["a longer allow over a shorter disallow", "User-agent: *\nDisallow: /schedule\nAllow: /schedule/8u", "/schedule/8u", true],
        ["a longer disallow over a shorter allow", "User-agent: *\nAllow: /schedule\nDisallow: /schedule/8u", "/schedule/8u", false],
        ["an allow and disallow of equal length (allow wins)", "User-agent: *\nDisallow: /schedule\nAllow: /schedule", "/schedule", true],
        ["a tie regardless of order", "User-agent: *\nAllow: /schedule\nDisallow: /schedule", "/schedule", true],
        ["a specific disallow inside an allowed folder", "User-agent: *\nAllow: /example/page/\nDisallow: /example/page/disallowed.gif", "/example/page/disallowed.gif", false],
        // Wildcards.
        ["a * in the middle", "User-agent: *\nDisallow: /*/standings", "/division/8u/standings", false],
        ["a * that doesn't reach", "User-agent: *\nDisallow: /*/standings", "/division/8u/schedule", true],
        ["a $ end anchor that matches", "User-agent: *\nDisallow: /*.php$", "/schedule.php", false],
        ["a $ end anchor that doesn't (more follows)", "User-agent: *\nDisallow: /*.php$", "/schedule.php?x=1", true],
        ["a $ on an exact path", "User-agent: *\nDisallow: /schedule$", "/schedule", false],
        ["a $ on an exact path with a longer request", "User-agent: *\nDisallow: /schedule$", "/schedule/8u", true],
        ["a trailing * (same as none)", "User-agent: *\nDisallow: /schedule*", "/schedule/8u", false],
        ["a pattern matching the query", "User-agent: *\nDisallow: /*?print=", "/schedule?print=1", false],
        // Case.
        ["paths are case-sensitive", "User-agent: *\nDisallow: /Schedule", "/schedule", true],
        ["record names are case-insensitive", "USER-AGENT: *\nDISALLOW: /schedule", "/schedule", false],
        // Percent-encoding.
        ["an encoded unreserved character equals its plain form", "User-agent: *\nDisallow: /%7Eteam", "/~team", false],
        ["a plain unreserved character equals its encoded form", "User-agent: *\nDisallow: /~team", "/%7eteam", false],
        ["an encoded reserved character stays encoded", "User-agent: *\nDisallow: /a%2Fb", "/a/b", true],
        ["hex case doesn't matter", "User-agent: *\nDisallow: /a%2fb", "/a%2Fb", false],
        ["a non-ASCII rule matches its UTF-8 encoding", "User-agent: *\nDisallow: /équipe", "/%C3%A9quipe", false],
        // Lines, comments and the BOM.
        ["a trailing comment", "User-agent: * # everyone\nDisallow: /schedule # not this", "/schedule", false],
        ["CRLF line ends", "User-agent: *\r\nDisallow: /schedule\r\n", "/schedule", false],
        ["CR line ends", "User-agent: *\rDisallow: /schedule\r", "/schedule", false],
        ["a byte order mark", "﻿User-agent: *\nDisallow: /schedule", "/schedule", false],
        ["whitespace around the colon", "User-agent :  *  \n  Disallow :  /schedule  ", "/schedule", false],
        ["lines without a colon are ignored", "User-agent: *\nthis is not a rule\nDisallow: /schedule", "/schedule", false],
        // The robots.txt file itself is always allowed.
        ["robots.txt itself", "User-agent: *\nDisallow: /", "/robots.txt", true],
    ])("%s", (_label, robots, path, expected) => {
        expect(allowed(robots, path)).toBe(expected);
    });

    describe("user-agent groups", () => {
        const robots = [
            "User-agent: *",
            "Disallow: /",
            "",
            "User-agent: OpenLeague",
            "Allow: /schedule",
            "Disallow: /",
            "",
            "User-agent: ExampleBot",
            "Disallow: /schedule",
        ].join("\n");

        it("uses our group, not *, when one names our product token", () => {
            expect(allowed(robots, "/schedule")).toBe(true);
            expect(allowed(robots, "/standings")).toBe(false);
        });

        it("matches the product token case-insensitively", () => {
            expect(allowed(robots.replace("OpenLeague", "openleague"), "/schedule")).toBe(true);
        });

        it("reads the token before a version or comment", () => {
            expect(allowed("User-agent: OpenLeague/1.1 (+https://openleague.dev)\nDisallow: /schedule\nUser-agent: *\nAllow: /", "/schedule")).toBe(false);
        });

        it("falls back to * when no group names us", () => {
            expect(allowed(robots, "/schedule", "OtherTool")).toBe(false);
        });

        it("doesn't match a token that merely starts with ours", () => {
            expect(allowed("User-agent: OpenLeagueExtra\nDisallow: /\nUser-agent: *\nAllow: /", "/schedule")).toBe(true);
        });

        it("shares rules among consecutive user-agent lines", () => {
            expect(allowed("User-agent: ExampleBot\nUser-agent: OpenLeague\nDisallow: /schedule", "/schedule")).toBe(false);
        });

        it("combines every group that names us", () => {
            const split = "User-agent: OpenLeague\nDisallow: /a\n\nUser-agent: ExampleBot\nDisallow: /\n\nUser-agent: OpenLeague\nDisallow: /b";
            expect(allowed(split, "/a")).toBe(false);
            expect(allowed(split, "/b")).toBe(false);
            expect(allowed(split, "/c")).toBe(true);
        });

        it("starts a new group at a user-agent line after rules", () => {
            expect(allowed("User-agent: OpenLeague\nAllow: /\nUser-agent: ExampleBot\nDisallow: /", "/schedule")).toBe(true);
        });

        it("ignores Sitemap and unknown records", () => {
            expect(allowed("Sitemap: https://league.example.org/sitemap.xml\nUser-agent: *\nHost: x\nDisallow: /schedule", "/schedule")).toBe(false);
        });
    });

    describe("Crawl-delay", () => {
        it.each<[string, number | null]>([
            ["User-agent: *\nCrawl-delay: 5", 5],
            ["User-agent: *\nCrawl-delay: 0.5", 0.5],
            ["User-agent: *\nCrawl-delay: soon", null],
            ["User-agent: *\nCrawl-delay: -3", null],
            ["User-agent: *\nDisallow: /x", null],
            ["User-agent: OpenLeague\nCrawl-delay: 2\nUser-agent: *\nCrawl-delay: 60", 2],
            ["User-agent: OpenLeague\nCrawl-delay: 2\n\nUser-agent: OpenLeague\nCrawl-delay: 7", 7],
        ])("%j reads as %j", (robots, delay) => {
            expect(parseRobotsTxt(robots).crawlDelaySec).toBe(delay);
        });
    });
});

describe("matchesRobotsPattern", () => {
    it("stays fast on a hostile pattern full of wildcards", () => {
        const pattern = `/${"*a".repeat(200)}b$`;
        const path = `/${"a".repeat(2000)}`;
        const started = performance.now();
        expect(matchesRobotsPattern(pattern, path)).toBe(false);
        expect(performance.now() - started).toBeLessThan(1000);
    });

    it("matches an empty remainder after a trailing *", () => {
        expect(matchesRobotsPattern("/schedule*", "/schedule")).toBe(true);
        expect(matchesRobotsPattern("/schedule*$", "/schedule")).toBe(true);
    });
});

describe("normalizeRobotsPath", () => {
    it("decodes unreserved octets, keeps reserved ones encoded and upper-cases hex", () => {
        expect(normalizeRobotsPath("/%41%2d%7e%2f%3f")).toBe("/A-~%2F%3F");
    });

    it("encodes non-ASCII as UTF-8 and leaves * and $ alone", () => {
        expect(normalizeRobotsPath("/é*$")).toBe("/%C3%A9*$");
    });
});

describe("RobotsGate", () => {
    const policy: RobotsPolicy = { rules: [{ allow: false, pattern: "/" }], crawlDelaySec: null };

    function clock(start = 1_000_000) {
        let now = start;
        return { now: () => now, advance: (ms: number) => (now += ms) };
    }

    it("caches a policy for at most 24 hours", () => {
        const time = clock();
        const gate = new RobotsGate({ now: time.now });
        gate.store("league.example.org", policy);
        time.advance(ROBOTS_CACHE_TTL_MS - 1);
        expect(gate.cached("league.example.org")).toBe(policy);
        time.advance(1);
        expect(gate.cached("league.example.org")).toBeNull();
    });

    it("lets Cache-Control shorten the cache, never lengthen it, and no-store skip it", () => {
        const time = clock();
        const gate = new RobotsGate({ now: time.now });
        gate.store("a.example.org", policy, 60_000);
        gate.store("b.example.org", policy, ROBOTS_CACHE_TTL_MS * 10);
        gate.store("c.example.org", policy, 0);
        expect(gate.cached("c.example.org")).toBeNull();
        time.advance(60_000);
        expect(gate.cached("a.example.org")).toBeNull();
        expect(gate.cached("b.example.org")).toBe(policy);
        time.advance(ROBOTS_CACHE_TTL_MS);
        expect(gate.cached("b.example.org")).toBeNull();
    });

    it("spaces requests by Crawl-delay, claiming the slot up front", () => {
        const time = clock();
        const gate = new RobotsGate({ now: time.now });
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ waitMs: 0 });
        // A second request straight away waits the whole delay, and a third queues behind it.
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ waitMs: 4_000 });
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ waitMs: 8_000 });
        // Past the longest wait: refused, and nothing claimed.
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ refusedMs: 12_000 });
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ refusedMs: 12_000 });
        time.advance(12_000);
        expect(gate.reserve("league.example.org", 4, 10_000)).toEqual({ waitMs: 0 });
        // Hosts are spaced independently.
        expect(gate.reserve("other.example.org", 4, 10_000)).toEqual({ waitMs: 0 });
    });

    it("counts a robots.txt request toward the spacing", () => {
        const time = clock();
        const gate = new RobotsGate({ now: time.now });
        gate.noteRequest("league.example.org");
        time.advance(1_000);
        expect(gate.reserve("league.example.org", 3, 10_000)).toEqual({ waitMs: 2_000 });
    });

    it("knows the hosts with written permission, normalised", () => {
        const gate = new RobotsGate({ permissions: [{ host: "League.Example.org.", note: "Email on file, 2026-10-11" }] });
        expect(gate.hasPermission("league.example.org")).toBe(true);
        expect(gate.hasPermission("other.example.org")).toBe(false);
    });
});
