#!/bin/sh
# Shared resolution helpers for the adrkit Spec Kit extension.
#
# Sourced by the command scripts, never executed directly.
#
# Every resolver here either yields a usable value or exits non-zero with a
# message naming exactly what is missing. That is the failure contract spike 008
# verified against live Spec Kit: never a silent success, never a fabricated
# payload, never an unhandled crash. Nothing here reaches the network or reads a
# credential (ADR-0007).

# A dependency the command needs is absent.
ADRKIT_EXIT_MISSING=1
# The invocation itself was wrong. Matches `adr`'s own usage-error code.
ADRKIT_EXIT_USAGE=2

adrkit_fail() {
	printf 'adrkit: %s\n' "$1" >&2
	exit "${2:-$ADRKIT_EXIT_MISSING}"
}

# Resolve the `adr` binary once, in a fixed, documented order. No branch of this
# reaches the network: a missing CLI is reported, never fetched.
_adrkit_cli_resolved=''

adrkit_resolve_cli() {
	if [ -n "$_adrkit_cli_resolved" ]; then
		return 0
	fi

	if [ -n "${ADRKIT_CLI:-}" ]; then
		[ -e "$ADRKIT_CLI" ] ||
			adrkit_fail "ADRKIT_CLI is set to '$ADRKIT_CLI', but nothing exists at that path"
		_adrkit_cli_resolved="$ADRKIT_CLI"
		return 0
	fi

	if [ -x ./node_modules/.bin/adr ]; then
		_adrkit_cli_resolved='./node_modules/.bin/adr'
		return 0
	fi

	if command -v adr >/dev/null 2>&1; then
		_adrkit_cli_resolved="$(command -v adr)"
		return 0
	fi

	adrkit_fail "adrkit's CLI is not installed — install it with 'npm install -g @adrkit/cli', add @adrkit/cli to this project, or set ADRKIT_CLI to its entry point"
}

# Run the resolved CLI, propagating its exit code verbatim. `adr` uses 1 for
# "found something wrong" and 2 for "you invoked me wrong"; collapsing those
# would throw away the distinction the caller needs.
adrkit_cli() {
	adrkit_resolve_cli
	case "$_adrkit_cli_resolved" in
	*.js | *.mjs | *.cjs)
		command -v node >/dev/null 2>&1 ||
			adrkit_fail "'$_adrkit_cli_resolved' needs node to run, but node is not on PATH"
		node "$_adrkit_cli_resolved" "$@"
		;;
	*)
		"$_adrkit_cli_resolved" "$@"
		;;
	esac
}

# The ADR corpus. Absent is an error, not an empty corpus: a governance check
# that silently reports "0 decisions govern this" because it was looking in the
# wrong directory is exactly the failure ADR-0016 was written about.
adrkit_corpus_dir() {
	_adrkit_corpus="${ADRKIT_DIR:-docs/adr}"
	[ -d "$_adrkit_corpus" ] ||
		adrkit_fail "no ADR corpus at '$_adrkit_corpus' — point ADRKIT_DIR at the corpus directory, or create the first record with 'adr new'"
	printf '%s' "$_adrkit_corpus"
}

# The current Spec Kit feature directory. Prefer the project's own resolver over
# reimplementing its branch/feature.json logic, which is upstream's to change.
adrkit_feature_dir() {
	if [ -n "${ADRKIT_FEATURE_DIR:-}" ]; then
		[ -d "$ADRKIT_FEATURE_DIR" ] ||
			adrkit_fail "ADRKIT_FEATURE_DIR is set to '$ADRKIT_FEATURE_DIR', but that directory does not exist"
		printf '%s' "$ADRKIT_FEATURE_DIR"
		return 0
	fi

	_adrkit_prereq='.specify/scripts/bash/check-prerequisites.sh'
	[ -x "$_adrkit_prereq" ] ||
		adrkit_fail "no Spec Kit feature context reachable — '$_adrkit_prereq' is missing or not executable and ADRKIT_FEATURE_DIR is unset. Run this from a Spec Kit project root, or set ADRKIT_FEATURE_DIR."

	_adrkit_paths="$("$_adrkit_prereq" --paths-only 2>/dev/null)" || _adrkit_paths=''
	_adrkit_feature="$(printf '%s\n' "$_adrkit_paths" | sed -n 's/^FEATURE_DIR: *//p' | head -n 1)"

	[ -n "$_adrkit_feature" ] ||
		adrkit_fail "Spec Kit resolved no FEATURE_DIR — run /speckit.specify first, or set ADRKIT_FEATURE_DIR"
	[ -d "$_adrkit_feature" ] ||
		adrkit_fail "Spec Kit resolved FEATURE_DIR '$_adrkit_feature', but that directory does not exist"

	printf '%s' "$_adrkit_feature"
}

# The plan this extension governs. Required by every command that claims to act
# "on the plan" — without it there is nothing to be honest about.
adrkit_plan_path() {
	_adrkit_plan="$(adrkit_feature_dir)/plan.md"
	[ -f "$_adrkit_plan" ] ||
		adrkit_fail "no plan at '$_adrkit_plan' — run /speckit.plan first"
	printf '%s' "$_adrkit_plan"
}
