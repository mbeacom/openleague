#!/bin/sh
# speckit.adrkit.check — check a produced plan against the decisions that govern
# it. This is the `after_plan` hook target, so it writes nothing, ever.
#
# Emits one or two sections on stdout, each introduced by a fixed marker line and
# followed by a single JSON document:
#
#   ==> adrkit:check       decisions governing the plan's paths (always)
#   ==> adrkit:evaluate    deterministic routing for the plan (only when a
#                          snapshot bundle is configured via ADRKIT_SNAPSHOT)
#
# The evaluator needs an offline snapshot bundle it cannot synthesize. Rather
# than fail the whole check when none is configured, the routing section is
# omitted and its absence is stated on stderr — an omission the caller is told
# about is not the same as a check that quietly did not run.
set -eu
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/adrkit-lib.sh"

adrkit_corpus="$(adrkit_corpus_dir)"
adrkit_plan="$(adrkit_plan_path)"

# Arguments are the paths the plan intends to touch. With none, fall back to the
# plan artifact itself, which is at least a path the corpus can speak about.
if [ "$#" -eq 0 ]; then
	set -- "$adrkit_plan"
fi

adrkit_status=0

printf '==> adrkit:check\n'
adrkit_cli check "$@" --dir "$adrkit_corpus" --json || adrkit_status=$?

if [ -n "${ADRKIT_SNAPSHOT:-}" ]; then
	[ -f "$ADRKIT_SNAPSHOT" ] ||
		adrkit_fail "ADRKIT_SNAPSHOT is set to '$ADRKIT_SNAPSHOT', but no snapshot bundle exists there"

	adrkit_as_of="${ADRKIT_AS_OF:-$(date -u +%Y-%m-%d)}"

	printf '==> adrkit:evaluate\n'
	adrkit_cli evaluate "$adrkit_plan" \
		--snapshot "$ADRKIT_SNAPSHOT" \
		--date "$adrkit_as_of" \
		--dir "$adrkit_corpus" \
		--json || adrkit_status=$?
else
	printf 'adrkit: no ADRKIT_SNAPSHOT configured — reporting governing decisions only, without deterministic routing\n' >&2
fi

exit "$adrkit_status"
