#!/usr/bin/env bash
#
# deploy-functions.sh
#
# Pushes all Supabase Edge Functions in tagit/supabase/functions to the
# linked Supabase project.
#
# Prerequisites:
#   - Supabase CLI installed (npm install -g supabase)
#   - Logged in (supabase login)
#   - Project linked (supabase link --project-ref <ref>)
#
# Environment variables (optional, with sensible defaults):
#   SUPABASE_PROJECT_REF   Supabase project ref (e.g. meiljgoztnhnyvtfkzuh)
#   FUNCTIONS_DIR          Directory containing edge functions (default: ./functions)
#   SUPABASE_ACCESS_TOKEN  Supabase personal access token (for non-interactive CI)

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FUNCTIONS_DIR="${FUNCTIONS_DIR:-${SCRIPT_DIR}/functions}"

# Optional single-function deploy: first arg is the function name
DEPLOY_FUNC="${1:-}"

# Supabase CLI resolves paths relative to CWD, so run from the script dir
cd "${SCRIPT_DIR}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-meiljgoztnhnyvtfkzuh}"

# ── Helpers ────────────────────────────────────────────────────────────────
log()  { printf '[deploy-functions] %s\n' "$*"; }
err()  { printf '[deploy-functions] ERROR: %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. See https://supabase.com/docs/guides/cli"
}

# ── Validate environment ───────────────────────────────────────────────────
require_cmd supabase

if [[ ! -d "${FUNCTIONS_DIR}" ]]; then
  die "Functions directory not found: ${FUNCTIONS_DIR}"
fi

# Count available functions (must have an index.ts or index.js entrypoint)
mapfile -t FUNCTIONS < <(find "${FUNCTIONS_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
VALID_FUNCTIONS=()
for func in "${FUNCTIONS[@]}"; do
  if [[ -f "${FUNCTIONS_DIR}/${func}/index.ts" ]]; then
    VALID_FUNCTIONS+=("${func}")
  else
    log "Skipping ${func}: no index.ts entrypoint (Supabase CLI requires index.ts)"
  fi
done
if [[ ${#VALID_FUNCTIONS[@]} -eq 0 ]]; then
  die "No edge functions with a valid entrypoint found in ${FUNCTIONS_DIR}"
fi

log "Found ${#VALID_FUNCTIONS[@]} deployable function(s): ${VALID_FUNCTIONS[*]}"

# ── Ensure Supabase CLI is authenticated ───────────────────────────────────
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  export SUPABASE_ACCESS_TOKEN
  log "Using SUPABASE_ACCESS_TOKEN for authentication"
elif ! supabase projects list >/dev/null 2>&1; then
  die "Not logged into Supabase. Run 'supabase login' or set SUPABASE_ACCESS_TOKEN."
fi

# ── Link project if not already linked ─────────────────────────────────────
if ! supabase status --remote "${SUPABASE_PROJECT_REF}" >/dev/null 2>&1; then
  log "Linking project ref: ${SUPABASE_PROJECT_REF}"
  supabase link --project-ref "${SUPABASE_PROJECT_REF}" || die "Failed to link project"
fi

# ── Deploy each function ───────────────────────────────────────────────────
FAILED=0
DEPLOYED=0

for func in "${VALID_FUNCTIONS[@]}"; do
  # If a single function was requested, skip everything else
  if [[ -n "${DEPLOY_FUNC}" && "${func}" != "${DEPLOY_FUNC}" ]]; then
    continue
  fi

  log "Deploying function: ${func}"
  if supabase functions deploy "${func}" --remote="${SUPABASE_PROJECT_REF}" --yes; then
    DEPLOYED=$((DEPLOYED + 1))
    log "✓ Deployed ${func}"
  else
    FAILED=$((FAILED + 1))
    err "✗ Failed to deploy ${func}"
  fi
done

# ── Summary ────────────────────────────────────────────────────────────────
if [[ -n "${DEPLOY_FUNC}" && ${DEPLOYED} -eq 0 ]]; then
  die "Function '${DEPLOY_FUNC}' not found or not deployable (no index.ts entrypoint)"
fi

log "Deployment complete: ${DEPLOYED} succeeded, ${FAILED} failed"

if [[ ${FAILED} -gt 0 ]]; then
  die "${FAILED} function(s) failed to deploy"
fi

exit 0
