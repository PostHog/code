#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/compute-release-tag.sh"
ORIGINAL_DIR="$PWD"
PASS=0
FAIL=0
TEST_DIR=""

trap 'cd "$ORIGINAL_DIR"; [ -n "$TEST_DIR" ] && rm -rf "$TEST_DIR"' EXIT

setup_repo() {
  TEST_DIR=$(mktemp -d)
  cd "$TEST_DIR"
  git init -q
  git config user.email "test@test.com"
  git config user.name "Test"
  git commit --allow-empty -m "init" -q
}

teardown_repo() {
  cd "$ORIGINAL_DIR"
  rm -rf "$TEST_DIR"
  TEST_DIR=""
}

run_script() {
  local tmpdir="${TMPDIR:-/tmp}"
  set +e
  bash "$SCRIPT" >"$tmpdir/crt-stdout" 2>"$tmpdir/crt-stderr"
  LAST_EXIT=$?
  set -e
  LAST_STDOUT=$(cat "$tmpdir/crt-stdout")
  LAST_STDERR=$(cat "$tmpdir/crt-stderr")
}

assert_eq() {
  local actual="$1" expected="$2" name="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" name="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name"
    echo "    expected to contain: $needle"
    echo "    got: $haystack"
    FAIL=$((FAIL + 1))
  fi
}

echo "compute-release-tag.sh"
echo ""

# ── No base tag ───────────────────────────────────────
echo "no base tag:"
setup_repo
run_script
assert_eq "$LAST_EXIT" "1" "exits 1"
assert_contains "$LAST_STDERR" "No version tag found" "prints error to stderr"
assert_eq "$LAST_STDOUT" "" "no stdout"
teardown_repo

# ── No commits since tag ──────────────────────────────
echo "no commits since tag:"
setup_repo
git tag v1.0
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_eq "$LAST_STDOUT" "" "no stdout"
assert_contains "$LAST_STDERR" "Nothing to release" "prints skip message"
teardown_repo

# ── Normal patch bump ─────────────────────────────────
echo "normal patch bump (2 commits):"
setup_repo
git tag v1.0
git commit --allow-empty -m "feat 1" -q
git commit --allow-empty -m "feat 2" -q
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_contains "$LAST_STDOUT" "tag=v1.0.2" "computes v1.0.2"
teardown_repo

# ── Single commit ─────────────────────────────────────
echo "single commit:"
setup_repo
git tag v3.2
git commit --allow-empty -m "fix" -q
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_contains "$LAST_STDOUT" "tag=v3.2.1" "computes v3.2.1"
teardown_repo

# ── Duplicate tag ─────────────────────────────────────
echo "duplicate tag already exists:"
setup_repo
git tag v1.0
git commit --allow-empty -m "feat" -q
git tag v1.0.1
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_eq "$LAST_STDOUT" "" "no stdout"
assert_contains "$LAST_STDERR" "already exists" "prints skip message"
teardown_repo

# ── vX.Y.0 base tag format ───────────────────────────
echo "vX.Y.0 base tag format:"
setup_repo
git tag v2.5.0
git commit --allow-empty -m "feat" -q
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_contains "$LAST_STDOUT" "tag=v2.5.1" "computes v2.5.1 from v2.5.0 base"
teardown_repo

# ── Picks latest base tag ────────────────────────────
echo "picks latest base tag when multiple exist:"
setup_repo
git tag v1.0
git commit --allow-empty -m "a" -q
git tag v1.1
git commit --allow-empty -m "b" -q
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_contains "$LAST_STDOUT" "tag=v1.1.1" "uses latest base for version"
teardown_repo

# ── Ignores non-base patch tags ──────────────────────
echo "ignores existing patch tags as base:"
setup_repo
git tag v1.0
git commit --allow-empty -m "a" -q
git tag v1.0.1
git commit --allow-empty -m "b" -q
git commit --allow-empty -m "c" -q
run_script
assert_eq "$LAST_EXIT" "0" "exits 0"
assert_contains "$LAST_STDOUT" "tag=v1.0.3" "counts all commits since base, not since patch"
teardown_repo

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
