#!/usr/bin/env python3
"""Scaffold, merge and clean up starter-drill batches for parallel authoring.

  python3 .claude/skills/import-drills/batch.py scaffold <name> [<name> ...]
  python3 .claude/skills/import-drills/batch.py merge <name> [<name> ...]   # appends in the order given
  python3 .claude/skills/import-drills/batch.py clean

Run from the repository root. A batch is lib/data/_batch-<name>.ts (the helper
section of starter-plays.ts plus `export const BATCH`) and
__tests__/lib/data/_batch-<name>.test.ts (the real per-drill invariants and
ice-area/note checks, pointed at BATCH, plus a playback attribution check).
Markers are matched as strings, so the script fails loudly if the source
files are restructured instead of silently building a weaker harness.
"""
import glob
import os
import sys

PLAYS = "lib/data/starter-plays.ts"
TESTS = "__tests__/lib/data/starter-plays.test.ts"
ARRAY_START = "export const STARTER_PLAYS: readonly StarterPlay[] = ["
BATCH_START = "export const BATCH: readonly StarterPlay[] = ["
PLACEHOLDER = "    // ENTRIES GO HERE"


def read(path):
    with open(path) as f:
        return f.read()


def helpers():
    src = read(PLAYS)
    if ARRAY_START not in src:
        sys.exit(f"marker not found in {PLAYS}: {ARRAY_START}")
    return src[: src.index(ARRAY_START)]


def section(src, start, end):
    if start not in src or end not in src[src.index(start):]:
        sys.exit(f"marker not found in {TESTS}: {start!r} .. {end!r}")
    i = src.index(start)
    return src[i : src.index(end, i)]


def harness(name):
    src = read(TESTS)
    head = section(src, "import ", 'describe("Starter play ice areas"')
    head = head.replace(
        'import { STARTER_PLAYS } from "@/lib/data/starter-plays";',
        f'import {{ BATCH as STARTER_PLAYS }} from "@/lib/data/_batch-{name}";\n'
        'import { compilePlayback, poseAt } from "@/lib/utils/canvas/playback";',
    )
    head = head.replace("toBeGreaterThanOrEqual(8);", "toBeGreaterThanOrEqual(1);")
    areas = section(src, '    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))("%s has no element outside its area"',
                    'describe("Starter drill tags"')
    areas = areas.rstrip().removesuffix("});").rstrip()
    mouth = section(src, '    it("never passes or shoots a goalie-drill puck through its own net mouth"',
                    '    it("ships ')
    return head + 'describe("Batch areas, notes and playback", () => {\n' + areas + "\n\n" + mouth + '''    it("animates: every skater route starts at a skater, and playback ends on the stored diagram", () => {
        for (const play of STARTER_PLAYS) {
            const pb = compilePlayback(play.playData);
            expect(poseAt(pb, pb.durationMs).data.drawings, play.id).toEqual(play.playData.drawings);
            for (const d of play.playData.drawings) {
                if (!["skate", "backskate", "carry"].includes(d.action)) continue;
                expect(pb.strokes.get(d.id)?.actorId ?? null, `${play.id} ${d.id} starts too far from any player`).not.toBeNull();
            }
        }
    });
});
'''


def scaffold(names):
    base = helpers()
    for name in names:
        with open(f"lib/data/_batch-{name}.ts", "w") as f:
            f.write(base + BATCH_START + "\n" + PLACEHOLDER + "\n];\n")
        with open(f"__tests__/lib/data/_batch-{name}.test.ts", "w") as f:
            f.write(harness(name))
        print(f"scaffolded {name}: bun run test __tests__/lib/data/_batch-{name}.test.ts")


def entries(name):
    src = read(f"lib/data/_batch-{name}.ts")
    if src[: src.index(BATCH_START)] != helpers():
        sys.exit(f"_batch-{name}.ts changed the helper section; move any new helper into starter-plays.ts by hand first")
    body = src[src.index(BATCH_START) + len(BATCH_START) : src.rindex("];")].strip("\n").rstrip().rstrip(",")
    if PLACEHOLDER.strip() in body:
        sys.exit(f"_batch-{name}.ts still has the placeholder")
    return body + ","


def merge(names):
    src = read(PLAYS)
    end = src.rindex("];")
    added = "\n".join(entries(n) for n in names)
    with open(PLAYS, "w") as f:
        f.write(src[:end].rstrip("\n") + "\n" + added + "\n" + src[end:])
    print(f"merged {', '.join(names)} into {PLAYS}")


def clean():
    for path in glob.glob("lib/data/_batch-*.ts") + glob.glob("__tests__/lib/data/_batch-*.test.ts"):
        os.remove(path)
        print(f"removed {path}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in {"scaffold", "merge", "clean"}:
        sys.exit(__doc__)
    {"scaffold": lambda: scaffold(sys.argv[2:]), "merge": lambda: merge(sys.argv[2:]), "clean": clean}[sys.argv[1]]()
