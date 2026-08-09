#!/bin/sh
# speckit.adrkit.context — pull the decisions governing this work into context.
#
# Read-only. With paths, reports the decisions governing exactly those paths.
# With none, reports the open decision queue, which is what a planner needs to
# know is already in flight.
set -eu
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/adrkit-lib.sh"

adrkit_corpus="$(adrkit_corpus_dir)"

if [ "$#" -gt 0 ]; then
	adrkit_cli check "$@" --dir "$adrkit_corpus" --json
else
	adrkit_cli queue --dir "$adrkit_corpus" --format json
fi
