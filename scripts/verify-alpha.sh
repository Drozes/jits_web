#!/usr/bin/env bash
#
# verify-alpha.sh
#
# Runs all quality checks for an alpha/beta release verification.
# Checks: typecheck, unit tests, web build, mobile bundle export.
#
# Usage:
#   ./scripts/verify-alpha.sh
#
# Exit code:
#   0 if all checks pass, 1 if any check fails.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Helpers ---

info()  { echo "[INFO]  $*"; }
pass()  { echo "[PASS]  $*"; }
fail_msg() { echo "[FAIL]  $*"; }

# Track results
TOTAL=0
PASSED=0
FAILED=0
FAILURES=()

run_check() {
  local name="$1"
  shift
  local cmd="$*"

  TOTAL=$((TOTAL + 1))
  echo ""
  echo "========================================"
  echo "  Step $TOTAL: $name"
  echo "========================================"
  echo "  Command: $cmd"
  echo ""

  if eval "$cmd"; then
    pass "$name"
    PASSED=$((PASSED + 1))
  else
    fail_msg "$name"
    FAILED=$((FAILED + 1))
    FAILURES+=("$name")
  fi
}

# --- Run checks ---

cd "$REPO_ROOT"

info "Starting alpha verification from $REPO_ROOT"
info "Timestamp: $(date)"
echo ""

# 1. TypeScript type checking (all workspaces)
run_check "TypeScript typecheck" "npm run typecheck"

# 2. Unit tests (all workspaces)
run_check "Unit tests" "npm run test"

# 3. Web production build
run_check "Web build" "npm run build:web"

# 4. Mobile bundle export (catches Metro/resolution errors tsc misses)
run_check "Mobile bundle export" "cd apps/mobile && npx expo export --platform ios --no-bytecode"

# --- Summary ---

echo ""
echo ""
echo "========================================"
echo "  Verification Summary"
echo "========================================"
echo ""
echo "  Total:   $TOTAL"
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo "  Failed checks:"
  for f in "${FAILURES[@]}"; do
    echo "    - $f"
  done
  echo ""
  echo "  Result: FAIL"
  echo ""
  exit 1
else
  echo "  Result: ALL CHECKS PASSED"
  echo ""
  exit 0
fi
