#!/usr/bin/env bash
#
# setup-supabase-env.sh
#
# Links a Supabase project and pushes all migrations from the backend repo.
#
# Prerequisites:
#   - Supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - A Supabase project already created via https://supabase.com/dashboard
#   - Your Supabase access token set via `supabase login` or SUPABASE_ACCESS_TOKEN env var
#   - The backend repo at the path specified by BACKEND_REPO_DIR
#
# Usage:
#   ./scripts/setup-supabase-env.sh <environment> <project-ref>
#
# Examples:
#   ./scripts/setup-supabase-env.sh staging abcdefghijklmnopqrst
#   ./scripts/setup-supabase-env.sh production xyzxyzxyzxyzxyzxyzxy
#
# Environment variables:
#   BACKEND_REPO_DIR   Path to the jr_be backend repo (default: ../jr_be relative to this repo)
#   SUPABASE_DB_PASSWORD   Database password (prompted if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_REPO_DIR="${BACKEND_REPO_DIR:-$(cd "$REPO_ROOT/../jr_be" 2>/dev/null && pwd || echo "")}"

# --- Helpers ---

usage() {
  echo "Usage: $0 <environment> <project-ref>"
  echo ""
  echo "Arguments:"
  echo "  environment   staging or production"
  echo "  project-ref   Supabase project reference ID (from project settings)"
  echo ""
  echo "Examples:"
  echo "  $0 staging abcdefghijklmnopqrst"
  echo "  $0 production xyzxyzxyzxyzxyzxyzxy"
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

ENV_NAME="$1"
PROJECT_REF="$2"

if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  fail "Environment must be 'staging' or 'production', got: $ENV_NAME"
fi

if [[ ${#PROJECT_REF} -lt 20 ]]; then
  fail "Project ref looks too short. Expected a 20-character Supabase project reference."
fi

# --- Check prerequisites ---

info "Checking prerequisites..."

if ! command -v supabase &>/dev/null; then
  fail "Supabase CLI not found. Install it: https://supabase.com/docs/guides/cli"
fi

SUPABASE_VERSION="$(supabase --version 2>&1 || true)"
ok "Supabase CLI found: $SUPABASE_VERSION"

if [[ -z "$BACKEND_REPO_DIR" || ! -d "$BACKEND_REPO_DIR/supabase/migrations" ]]; then
  fail "Backend repo not found at '$BACKEND_REPO_DIR'. Set BACKEND_REPO_DIR to the jr_be repo path."
fi

MIGRATION_COUNT="$(ls "$BACKEND_REPO_DIR/supabase/migrations/"*.sql 2>/dev/null | wc -l | tr -d ' ')"
ok "Backend repo found at $BACKEND_REPO_DIR ($MIGRATION_COUNT migrations)"

# --- Link project ---

info "Linking to Supabase project: $PROJECT_REF (environment: $ENV_NAME)..."

cd "$BACKEND_REPO_DIR"

# supabase link will prompt for the database password if SUPABASE_DB_PASSWORD is not set
supabase link --project-ref "$PROJECT_REF"
ok "Project linked successfully"

# --- Push migrations ---

info "Pushing migrations to $ENV_NAME ($PROJECT_REF)..."

supabase db push
ok "All migrations pushed"

# --- Summary ---

echo ""
echo "============================================"
echo "  Supabase $ENV_NAME setup complete"
echo "============================================"
echo ""
echo "  Environment:   $ENV_NAME"
echo "  Project ref:   $PROJECT_REF"
echo "  Migrations:    $MIGRATION_COUNT pushed"
echo "  Backend repo:  $BACKEND_REPO_DIR"
echo ""
echo "Next steps:"
echo "  1. Set environment variables in your app:"
echo "     - NEXT_PUBLIC_SUPABASE_URL (web)"
echo "     - NEXT_PUBLIC_SUPABASE_ANON_KEY (web)"
echo "     - EXPO_PUBLIC_SUPABASE_URL (mobile)"
echo "     - EXPO_PUBLIC_SUPABASE_ANON_KEY (mobile)"
echo "  2. Verify the database via Supabase Dashboard"
echo "  3. Configure RLS policies if needed"
echo ""
