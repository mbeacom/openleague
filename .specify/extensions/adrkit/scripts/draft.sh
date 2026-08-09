#!/bin/sh
# speckit.adrkit.draft — scaffold one new ADR from the current plan artifact.
#
# The only command in this extension that writes, and deliberately unreachable
# from any hook: a plan-phase hook that creates records without being asked
# would manufacture decision memory rather than record it.
#
# The split of labor is deliberate. This script does the part that must be
# deterministic — allocate the next id, write a schema-valid draft at the right
# path — and prints where it landed. Filling the body from the plan is the
# agent's job, because that part is judgment, not mechanism.
set -eu
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/adrkit-lib.sh"

adrkit_corpus="$(adrkit_corpus_dir)"
# Required, not decorative: "draft an ADR from the plan" is not a thing that can
# be done without a plan, and scaffolding an empty record anyway would be the
# fabricated-success failure this extension is supposed to prevent.
adrkit_plan="$(adrkit_plan_path)"

adrkit_title="$*"
if [ -z "$adrkit_title" ]; then
	adrkit_fail "draft needs a title — e.g. /speckit.adrkit.draft Adopt Postgres for the read model" "$ADRKIT_EXIT_USAGE"
fi

printf 'adrkit: drafting from %s\n' "$adrkit_plan" >&2
adrkit_cli new "$adrkit_title" --status draft --dir "$adrkit_corpus" --json
