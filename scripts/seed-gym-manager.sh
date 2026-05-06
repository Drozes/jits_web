#!/usr/bin/env bash
#
# seed-gym-manager.sh
#
# Inserts a gym manager record into the gym_managers table via psql.
#
# Prerequisites:
#   - psql installed (comes with PostgreSQL)
#   - Database connection string set via DATABASE_URL env var,
#     or SUPABASE_DB_HOST / SUPABASE_DB_PASSWORD env vars
#
# Usage:
#   ./scripts/seed-gym-manager.sh <athlete_id> <gym_id>
#
# Examples:
#   # Using DATABASE_URL
#   DATABASE_URL="postgresql://postgres:password@db.abcdef.supabase.co:5432/postgres" \
#     ./scripts/seed-gym-manager.sh "a1b2c3d4-uuid" "g5h6i7j8-uuid"
#
#   # Using individual connection vars
#   SUPABASE_DB_HOST="db.abcdef.supabase.co" \
#   SUPABASE_DB_PASSWORD="your-db-password" \
#     ./scripts/seed-gym-manager.sh "a1b2c3d4-uuid" "g5h6i7j8-uuid"
#
# Environment variables:
#   DATABASE_URL         Full PostgreSQL connection string (preferred)
#   SUPABASE_DB_HOST     Supabase database host (e.g., db.abcdef.supabase.co)
#   SUPABASE_DB_PASSWORD Database password
#   SUPABASE_DB_PORT     Database port (default: 5432)
#   SUPABASE_DB_NAME     Database name (default: postgres)
#   SUPABASE_DB_USER     Database user (default: postgres)

set -euo pipefail

# --- Helpers ---

usage() {
  echo "Usage: $0 <athlete_id> <gym_id>"
  echo ""
  echo "Arguments:"
  echo "  athlete_id   UUID of the athlete to make a gym manager"
  echo "  gym_id       UUID of the gym they will manage"
  echo ""
  echo "Environment:"
  echo "  DATABASE_URL          Full connection string (preferred)"
  echo "  SUPABASE_DB_HOST      Database host (alternative to DATABASE_URL)"
  echo "  SUPABASE_DB_PASSWORD  Database password (alternative to DATABASE_URL)"
  echo ""
  echo "Examples:"
  echo "  DATABASE_URL=\"postgresql://postgres:pw@db.xyz.supabase.co:5432/postgres\" \\"
  echo "    $0 \"a1b2c3d4-...\" \"e5f6g7h8-...\""
  exit 1
}

info()  { echo "[INFO]  $*"; }
ok()    { echo "[OK]    $*"; }
err()   { echo "[ERROR] $*" >&2; }
fail()  { err "$*"; exit 1; }

# --- Validate arguments ---

if [[ $# -lt 2 ]]; then
  usage
fi

ATHLETE_ID="$1"
GYM_ID="$2"

# Basic UUID format check (loose, accepts with or without hyphens)
UUID_REGEX='^[0-9a-fA-F-]{32,36}$'
if [[ ! "$ATHLETE_ID" =~ $UUID_REGEX ]]; then
  fail "athlete_id does not look like a UUID: $ATHLETE_ID"
fi
if [[ ! "$GYM_ID" =~ $UUID_REGEX ]]; then
  fail "gym_id does not look like a UUID: $GYM_ID"
fi

# --- Check prerequisites ---

if ! command -v psql &>/dev/null; then
  fail "psql not found. Install PostgreSQL or use 'brew install libpq' on macOS."
fi

# --- Build connection string ---

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN_STRING="$DATABASE_URL"
  info "Using DATABASE_URL for connection"
elif [[ -n "${SUPABASE_DB_HOST:-}" && -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  DB_PORT="${SUPABASE_DB_PORT:-5432}"
  DB_NAME="${SUPABASE_DB_NAME:-postgres}"
  DB_USER="${SUPABASE_DB_USER:-postgres}"
  CONN_STRING="postgresql://${DB_USER}:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:${DB_PORT}/${DB_NAME}"
  info "Using SUPABASE_DB_HOST for connection"
else
  fail "Set DATABASE_URL or both SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD."
fi

# --- Insert gym manager ---

info "Inserting gym manager: athlete=$ATHLETE_ID, gym=$GYM_ID..."

RESULT=$(psql "$CONN_STRING" -t -A -c "
  INSERT INTO public.gym_managers (athlete_id, gym_id)
  VALUES ('$ATHLETE_ID', '$GYM_ID')
  ON CONFLICT (athlete_id, gym_id) DO NOTHING
  RETURNING athlete_id, gym_id, created_at;
" 2>&1) || {
  fail "psql command failed: $RESULT"
}

if [[ -z "$RESULT" ]]; then
  info "No row returned. This athlete may already be a manager for this gym."
  echo ""

  # Verify the existing record
  EXISTING=$(psql "$CONN_STRING" -t -A -c "
    SELECT athlete_id, gym_id, created_at
    FROM public.gym_managers
    WHERE athlete_id = '$ATHLETE_ID' AND gym_id = '$GYM_ID';
  " 2>&1) || {
    fail "Could not verify existing record: $EXISTING"
  }

  if [[ -n "$EXISTING" ]]; then
    ok "Existing gym manager record found:"
    echo "  $EXISTING"
  else
    fail "Insert returned no rows and no existing record found. Check that the athlete and gym exist."
  fi
else
  ok "Gym manager inserted successfully:"
  echo "  $RESULT"
fi

echo ""
echo "Done."
